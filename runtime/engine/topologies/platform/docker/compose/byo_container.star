# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# Container runtime options for a bring-your-own resource (service.json `container`, #2907).
# Compose keys that a real image needs and that Flisk cannot infer: capabilities (WARP needs NET_ADMIN), a read-only root,
# a fixed user, security options and a larger /dev/shm (a headless browser). GPU and HPC workloads (vLLM, Ollama, cuQuantum,
# large state-vector simulators) also set GPUs, CPU and memory limits and IPC. Each value is checked character by character,
# because it is written into the generated Compose YAML as it is. Keep in step with containerErrors in
# cli/src/utils/service-manifest.ts. This file has no load() on purpose.
# =============================================================================

_CAP_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ_"
_USER_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-:"
_SECURITY_OPT_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-:=/"
_SIZE_UNITS = ["b", "k", "kb", "m", "mb", "g", "gb"]
_IPC_MODES = ["host", "private", "shareable", "none"]
_SIZE_FACTORS = {"": 1, "b": 1, "k": 1024, "kb": 1024, "m": 1024 * 1024, "mb": 1024 * 1024, "g": 1024 * 1024 * 1024, "gb": 1024 * 1024 * 1024}

# Flisk's default limits for a backend container. `cpus` and `memory` replace the limits; a reservation never exceeds its limit.
_DEFAULT_CPUS = "0.5"
_DEFAULT_MEMORY = "512M"
_RESERVED_CPU_HUNDREDTHS = 20
_RESERVED_MEMORY = "256M"
_RESERVED_MEMORY_BYTES = 256 * 1024 * 1024


def _only(value, chars):
    if type(value) != "string" or not value:
        return False
    for c in value.elems():
        if c not in chars:
            return False
    return True


def _string_list(container, key, chars, expected):
    values = container.get(key)
    if values == None:
        return []
    if type(values) != "list":
        fail("MANIFEST ERROR: 'container.{}' must be a list of {}".format(key, expected))
    for value in values:
        if not _only(value, chars):
            fail("MANIFEST ERROR: 'container.{}' entries must be {}".format(key, expected))
    return values


def _command_list(container):
    """`command`: the start command (Compose command), written as a JSON list, which YAML reads as a flow sequence."""
    command = container.get('command')
    if command == None:
        return None
    ok = type(command) == "list" and len(command) > 0
    if ok:
        for part in command:
            if type(part) != "string" or not part:
                ok = False
                break
            for c in part.elems():
                if c < " " or c == "\x7f":
                    ok = False
                    break
    if not ok:
        fail("MANIFEST ERROR: 'container.command' must be a list of non-empty strings without control characters")
    return command


def _valid_size(value):
    if type(value) != "string":
        return False
    n = 0
    for c in value.elems():
        if not c.isdigit():
            break
        n += 1
    unit = value[n:].lower()
    return n > 0 and (unit == "" or unit in _SIZE_UNITS)


def _size_bytes(value):
    n = 0
    for c in value.elems():
        if not c.isdigit():
            break
        n += 1
    return int(value[:n]) * _SIZE_FACTORS[value[n:].lower()]


def _cpus_value(value):
    """A CPU count such as 4 or "2.5": returns its text and its value in hundredths, or fails."""
    if type(value) == "int" and value > 0:
        return str(value), value * 100
    if type(value) == "string" and value:
        whole, _, fraction = value.partition(".")
        if whole.isdigit() and (fraction == "" or (fraction.isdigit() and len(fraction) <= 2)) and value.count(".") <= 1:
            hundredths = int(whole) * 100 + (int((fraction + "00")[:2]) if fraction else 0)
            if hundredths > 0:
                return value, hundredths
    fail("MANIFEST ERROR: 'container.cpus' must be a CPU count above 0 such as 4 or \"2.5\"")


def _deploy_section(cpus, memory, gpus):
    """The service's `deploy:` block: Flisk's default limits, or the ones from `container`, plus GPU device reservations."""
    cpus_text, cpus_hundredths = cpus if cpus else (_DEFAULT_CPUS, 50)
    reserved_cpus = "0.2" if cpus_hundredths >= _RESERVED_CPU_HUNDREDTHS else cpus_text
    memory_text = memory or _DEFAULT_MEMORY
    reserved_memory = _RESERVED_MEMORY if memory == None or _size_bytes(memory) >= _RESERVED_MEMORY_BYTES else memory
    lines = [
        "    deploy:",
        "      resources:",
        "        limits:",
        "          cpus: '{}'".format(cpus_text),
        "          memory: {}".format(memory_text),
        "        reservations:",
        "          cpus: '{}'".format(reserved_cpus),
        "          memory: {}".format(reserved_memory),
    ]
    if gpus != None:
        lines.extend([
            "          devices:",
            "            - driver: nvidia",
            "              count: {}".format(gpus),
            "              capabilities: [gpu]",
        ])
    return "\n".join(lines) + "\n"


DEFAULT_DEPLOY_SECTION = _deploy_section(None, None, None)


def byo_container_options(manifest):
    """Compose settings from service.json `container` for a bring-your-own resource.

    Returns struct(init, section, deploy): `init` is the value for the service's `init:` key (Flisk's default stays true),
    `section` is the YAML for the other keys, indented for a service entry, or "" when nothing is set, and `deploy` is the
    service's `deploy:` block (Flisk's default limits unless `cpus`, `memory` or `gpus` is set). Other resource types get the
    defaults: `container` is only read for bring-your-own (the CLI reports it elsewhere).
    """
    container = manifest.get('container') if manifest else None
    if container == None or manifest.get('appType') != 'bring-your-own':
        return struct(init = True, section = "", deploy = DEFAULT_DEPLOY_SECTION)
    if type(container) != "dict":
        fail("MANIFEST ERROR: 'container' must be an object")

    init = container.get('init', True)
    if type(init) != "bool":
        fail("MANIFEST ERROR: 'container.init' must be true or false")

    lines = []
    command = _command_list(container)
    if command:
        # Compose interpolates $: a start command that expands a variable inside the container writes $$VAR.
        lines.append("    command: {}".format(encode_json(command)))
    for key, compose_key in [('capAdd', 'cap_add'), ('capDrop', 'cap_drop')]:
        caps = _string_list(container, key, _CAP_CHARS, "capability names such as NET_ADMIN or ALL")
        if caps:
            lines.append("    {}:".format(compose_key))
            lines.extend(["      - {}".format(cap) for cap in caps])

    read_only = container.get('readOnly')
    if read_only != None:
        if type(read_only) != "bool":
            fail("MANIFEST ERROR: 'container.readOnly' must be true or false")
        lines.append("    read_only: {}".format("true" if read_only else "false"))

    user = container.get('user')
    if user != None:
        if not _only(user, _USER_CHARS):
            fail("MANIFEST ERROR: 'container.user' must be a user or uid[:gid] such as 10001:10001")
        lines.append('    user: "{}"'.format(user))

    security_opts = _string_list(container, 'securityOpt', _SECURITY_OPT_CHARS, "options such as no-new-privileges:true")
    if security_opts:
        lines.append("    security_opt:")
        lines.extend(['      - "{}"'.format(opt) for opt in security_opts])

    shm_size = container.get('shmSize')
    if shm_size != None:
        if not _valid_size(shm_size):
            fail("MANIFEST ERROR: 'container.shmSize' must be a size such as 256mb or 1g")
        lines.append('    shm_size: "{}"'.format(shm_size))

    ipc = container.get('ipc')
    if ipc != None:
        if ipc not in _IPC_MODES:
            fail("MANIFEST ERROR: 'container.ipc' must be one of {}".format(", ".join(_IPC_MODES)))
        lines.append('    ipc: "{}"'.format(ipc))

    gpus = container.get('gpus')
    if gpus != None and not (gpus == "all" or (type(gpus) == "int" and gpus > 0)):
        fail("MANIFEST ERROR: 'container.gpus' must be \"all\" or a GPU count of 1 or more")
    cpus = _cpus_value(container.get('cpus')) if container.get('cpus') != None else None
    memory = container.get('memory')
    if memory != None and not (_valid_size(memory) and _size_bytes(memory) > 0):
        fail("MANIFEST ERROR: 'container.memory' must be a size such as 8g or 512mb")

    return struct(
        init = init,
        section = "\n".join(lines) + "\n" if lines else "",
        deploy = _deploy_section(cpus, memory, gpus),
    )
