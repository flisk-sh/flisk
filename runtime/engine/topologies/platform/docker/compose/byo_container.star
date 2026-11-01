# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# Container runtime options for a bring-your-own resource (service.json `container`, #2907).
# Compose keys that a real image needs and that Flisk cannot infer: capabilities (WARP needs NET_ADMIN), a read-only root,
# a fixed user, security options and a larger /dev/shm (a headless browser). GPU and HPC workloads (vLLM, Ollama, cuQuantum,
# large state-vector simulators) also set GPUs, CPU and memory limits and IPC. Imported Compose stacks also set a stop grace
# period, extra /etc/hosts entries, ulimits and extra DNS names on the backend network (networkAliases), and `restart` can be
# on-failure:N. Each value is checked character by character,
# because it is written into the generated Compose YAML as it is. Keep in step with containerErrors in
# cli/src/utils/service-manifest.ts. This file has no load() on purpose.
# =============================================================================

_CAP_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ_"
_USER_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-:"
_SECURITY_OPT_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-:=/"
_SIZE_UNITS = ["b", "k", "kb", "m", "mb", "g", "gb"]
_PATH_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_./-"
_TMPFS_OPTION_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789=,_-"
_IPC_MODES = ["host", "private", "shareable", "none"]
_HOST_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-"
_ALIAS_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-"
_IPV6_CHARS = "0123456789abcdefABCDEF:"
_VARIABLE_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"
_DURATION_UNITS = ["us", "ms", "s", "m", "h"]
_ULIMIT_NAMES = ["as", "core", "cpu", "data", "fsize", "locks", "memlock", "msgqueue", "nice", "nofile", "nproc", "rss", "rtprio", "rttime", "sigpending", "stack"]
_RESTART_POLICIES = ["no", "on-failure", "unless-stopped", "always"]
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


def _tmpfs_entry(value):
    """`/tmp` or `/tmp:noexec,nosuid,nodev,size=100m`: an absolute path in the container, then optional mount options."""
    if type(value) != "string":
        return False
    path, colon, options = value.partition(":")
    if not path.startswith("/") or not _only(path, _PATH_CHARS) or "/../" in path + "/":
        return False
    return not colon or _only(options, _TMPFS_OPTION_CHARS)


def _duration_pair(number, unit):
    whole, dot, fraction = number.partition(".")
    return unit in _DURATION_UNITS and whole.isdigit() and (not dot or fraction.isdigit())


def _duration(value):
    """A Compose duration such as 30s, 1m30s or 1.5s: one or more number-and-unit pairs."""
    if type(value) != "string" or not value:
        return False
    pairs = []
    number = ""
    unit = ""
    for c in value.elems():
        if c.isdigit() or c == ".":
            if unit:
                pairs.append((number, unit))
                number, unit = "", ""
            number += c
        elif c in "umsh" and number:
            unit += c
        else:
            return False
    pairs.append((number, unit))
    for number, unit in pairs:
        if not _duration_pair(number, unit):
            return False
    return True


def _ipv4(value):
    parts = value.split(".")
    if len(parts) != 4:
        return False
    for part in parts:
        if not part.isdigit() or len(part) > 3 or int(part) > 255:
            return False
    return True


def _host_address(address):
    if address == "host-gateway" or _ipv4(address):
        return True
    # An IPv6 address has at least two colons; a lone ":" would resolve to "name::" and the daemon rejects it.
    return address.count(":") >= 2 and _only(address, _IPV6_CHARS)


def _extra_host(value):
    """`name:address`: a hostname, then host-gateway, an IPv4 address or an IPv6 address, or a Compose variable for the address:
    ${NAME}, ${NAME:-address} or ${NAME-address} (open-mercato: host.docker.internal:${OM_HOST_GATEWAY:-host-gateway})."""
    if type(value) != "string":
        return False
    name, colon, address = value.partition(":")
    if not colon or not _only(name, _HOST_CHARS) or name[0] in ".-":
        return False
    if address.startswith("${") and address.endswith("}"):
        body = address[2:-1]
        for op in [":-", "-"]:
            variable, sep, default = body.partition(op)
            if sep:
                return _only(variable, _VARIABLE_CHARS) and not variable[0].isdigit() and _host_address(default)
        return _only(body, _VARIABLE_CHARS) and not body[0].isdigit()
    return _host_address(address)


def _ulimit_int(value):
    return type(value) == "int" and value >= -1


def _ulimit_lines(ulimits):
    """`ulimits`: {"nofile": {"soft": 65536, "hard": 65536}, "nproc": 65535}."""
    if type(ulimits) != "dict":
        fail("MANIFEST ERROR: 'container.ulimits' must be an object such as {\"nofile\": {\"soft\": 65536, \"hard\": 65536}}")
    lines = []
    for name in sorted(ulimits.keys()):
        value = ulimits[name]
        if name not in _ULIMIT_NAMES:
            fail("MANIFEST ERROR: 'container.ulimits' names must be one of {}".format(", ".join(_ULIMIT_NAMES)))
        if _ulimit_int(value):
            lines.append("      {}: {}".format(name, value))
            continue
        if type(value) != "dict" or sorted(value.keys()) != ["hard", "soft"] or not _ulimit_int(value["soft"]) or not _ulimit_int(value["hard"]):
            fail("MANIFEST ERROR: 'container.ulimits.{}' must be a number, or {{\"soft\": <number>, \"hard\": <number>}}".format(name))
        if value["hard"] != -1 and (value["soft"] == -1 or value["soft"] > value["hard"]):
            fail("MANIFEST ERROR: 'container.ulimits.{}' soft must not be above hard".format(name))
        lines.extend(["      {}:".format(name), "        soft: {}".format(value["soft"]), "        hard: {}".format(value["hard"])])
    return lines


def byo_restart_policy(manifest):
    """service.json `restart` on a bring-your-own resource: no, on-failure, on-failure:N (N 1..100), unless-stopped or always.

    Returns the Compose value, or None when `restart` is not set (or the resource is not bring-your-own).
    """
    if not manifest or manifest.get('appType') != 'bring-your-own' or manifest.get('restart') == None:
        return None
    restart = manifest.get('restart')
    if restart in _RESTART_POLICIES:
        return restart
    if type(restart) == "string" and restart.startswith("on-failure:"):
        count = restart[len("on-failure:"):]
        if count.isdigit() and count[0] != "0" and int(count) <= 100:
            return restart
    fail("MANIFEST ERROR: 'restart' must be one of no, on-failure, on-failure:N (N from 1 to 100), unless-stopped, always")


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
        return struct(init = True, section = "", deploy = DEFAULT_DEPLOY_SECTION, network_aliases = [])
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

    tmpfs = container.get('tmpfs')
    if tmpfs != None:
        if type(tmpfs) != "list":
            fail("MANIFEST ERROR: 'container.tmpfs' must be a list of paths such as /tmp:noexec,nosuid,size=100m")
        for entry in tmpfs:
            if not _tmpfs_entry(entry):
                fail("MANIFEST ERROR: 'container.tmpfs' entries must be an absolute path with optional options, such as /tmp:noexec,nosuid,size=100m")
        if tmpfs:
            lines.append("    tmpfs:")
            lines.extend(['      - "{}"'.format(entry) for entry in tmpfs])

    ipc = container.get('ipc')
    if ipc != None:
        if ipc not in _IPC_MODES:
            fail("MANIFEST ERROR: 'container.ipc' must be one of {}".format(", ".join(_IPC_MODES)))
        lines.append('    ipc: "{}"'.format(ipc))

    stop_grace_period = container.get('stopGracePeriod')
    if stop_grace_period != None:
        if not _duration(stop_grace_period):
            fail("MANIFEST ERROR: 'container.stopGracePeriod' must be a duration such as 30s or 1m30s")
        lines.append('    stop_grace_period: "{}"'.format(stop_grace_period))

    extra_hosts = container.get('extraHosts')
    if extra_hosts != None:
        if type(extra_hosts) != "list":
            fail("MANIFEST ERROR: 'container.extraHosts' must be a list such as [\"host.docker.internal:host-gateway\"]")
        for entry in extra_hosts:
            if not _extra_host(entry):
                fail("MANIFEST ERROR: 'container.extraHosts' entries must be name:address, such as host.docker.internal:host-gateway or db:10.0.0.5")
        if extra_hosts:
            lines.append("    extra_hosts:")
            lines.extend(['      - "{}"'.format(entry) for entry in extra_hosts])

    ulimits = container.get('ulimits')
    if ulimits != None:
        ulimit_lines = _ulimit_lines(ulimits)
        if ulimit_lines:
            lines.append("    ulimits:")
            lines.extend(ulimit_lines)

    aliases = container.get('networkAliases')
    if aliases == None:
        aliases = []
    if type(aliases) != "list":
        fail("MANIFEST ERROR: 'container.networkAliases' must be a list of names such as [\"mercure\"]")
    for alias in aliases:
        if not _only(alias, _ALIAS_CHARS) or alias[0] in "_.-":
            fail("MANIFEST ERROR: 'container.networkAliases' entries must be names such as mercure (letters, digits, '-', '_' and '.')")
    if len(aliases) != len({a: True for a in aliases}):
        fail("MANIFEST ERROR: 'container.networkAliases' lists a name twice")
    if aliases and manifest.get('sidecarOf'):
        fail("MANIFEST ERROR: 'container.networkAliases' does not apply to a sidecar (sidecarOf), which shares another container's network")

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
        network_aliases = aliases,
    )
