# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# Container runtime options for a bring-your-own resource (service.json `container`, #2907).
# Compose keys that a real image needs and that Flisk cannot infer: capabilities (WARP needs NET_ADMIN), a read-only root,
# a fixed user, security options and a larger /dev/shm (a headless browser). Each value is checked character by character,
# because it is written into the generated Compose YAML as it is. Keep in step with containerErrors in
# cli/src/utils/service-manifest.ts. This file has no load() on purpose.
# =============================================================================

_CAP_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ_"
_USER_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-:"
_SECURITY_OPT_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-:=/"
_SIZE_UNITS = ["b", "k", "kb", "m", "mb", "g", "gb"]


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


def byo_container_options(manifest):
    """Compose settings from service.json `container` for a bring-your-own resource.

    Returns struct(init, section): `init` is the value for the service's `init:` key (Flisk's default stays true), and
    `section` is the YAML for the other keys, indented for a service entry, or "" when nothing is set. Other resource types
    get the defaults: `container` is only read for bring-your-own (the CLI reports it elsewhere).
    """
    container = manifest.get('container') if manifest else None
    if container == None or manifest.get('appType') != 'bring-your-own':
        return struct(init = True, section = "")
    if type(container) != "dict":
        fail("MANIFEST ERROR: 'container' must be an object")

    init = container.get('init', True)
    if type(init) != "bool":
        fail("MANIFEST ERROR: 'container.init' must be true or false")

    lines = []
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

    return struct(init = init, section = "\n".join(lines) + "\n" if lines else "")
