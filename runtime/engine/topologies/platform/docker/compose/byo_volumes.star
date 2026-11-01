# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# Volumes for a bring-your-own resource (service.json `volumes`, #1748).
# A self-hosted app keeps its data in Compose volumes (tubehaus: its library in /data, Postgres data, Caddy's certificates);
# without them every restart starts from nothing. Two kinds:
#   - a named volume ("source": "library"): declared at the top of the stack's Compose file, kept by `flisk down`;
#   - a bind mount ("source": "./config"): a path relative to the service directory that must stay inside the project.
# A named volume can set "name", the Docker volume's own name (#2964). Without it Compose prefixes the generated project's
# name, so an existing Compose install's volume (myapp_data) is not found and its data looks lost; with it, both use one volume.
# A bind mount's source may come from the environment, "${OM_MCP_SHARED_DIR:-./.mercato/mcp-shared}" (or ${NAME-./path}): the
# default must be a bind path inside the project and is resolved like any other; the variable is left for Compose, which uses
# the value it is given as it is (relative to the generated Compose file, so set an absolute path). "selinux": "z" or "Z" adds the
# SELinux relabel option to a bind mount (any-sync uses :Z).
# Each value is checked character by character, because it is written into the generated Compose YAML as it is. Keep in step
# with volumesErrors in cli/src/utils/service-manifest.ts. This file has no load() on purpose.
# =============================================================================

VOLUME_MARKER = "# flisk-byo-volume: "

_NAME_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789_-"
_PATH_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-/"
_DOCKER_NAME_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-"
_VARIABLE_START = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_"
_VARIABLE_CHARS = _VARIABLE_START + "0123456789"


_SEGMENT_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-"


def _source_variable(source):
    """A bind source from the environment: `${NAME}`, `${NAME:-./path}` or `${NAME-./path}`, then an optional `/sub/path`.

    Returns (name, operator, default path, suffix), with operator and default "" for a bare ${NAME}, None when source is not a
    variable, or ("", "", "", "") when it is malformed.
    """
    bad = ("", "", "", "")
    if not source.startswith("${"):
        return None
    end = source.find("}")
    if end < 0:
        return bad
    body = source[2:end]
    suffix = source[end + 1:]
    if suffix:
        if not suffix.startswith("/"):
            return bad
        for segment in suffix[1:].split("/"):
            if not segment or segment in [".", ".."] or not _only(segment, _SEGMENT_CHARS):
                return bad
    for op in [":-", "-"]:
        name, sep, default = body.partition(op)
        if sep:
            if name and name[0] in _VARIABLE_START and _only(name, _VARIABLE_CHARS) and _is_bind(default):
                return (name, op, default, suffix)
            return bad
    if body and body[0] in _VARIABLE_START and _only(body, _VARIABLE_CHARS):
        return (body, "", "", suffix)
    return bad


def _only(value, chars):
    for c in value.elems():
        if c not in chars:
            return False
    return True


def _is_bind(source):
    return source == "." or source.startswith("./") or source.startswith("../")


def _bind_path(source, service_path, field):
    """`source` relative to the project root, or fail() when it leaves the project."""
    parts = [p for p in service_path.split('/') if p and p != '.']
    for segment in source.split('/'):
        if segment == '' or segment == '.':
            continue
        if segment == '..':
            if not parts:
                fail("MANIFEST ERROR: '{}' must stay inside the project".format(field))
            parts = parts[:-1]
        else:
            parts.append(segment)
    return '/'.join(parts)


def byo_volumes(manifest, service_path, compose_dir):
    """Compose `volumes:` lines for service.json `volumes` on a bring-your-own resource.

    Args:
        manifest: the service.json
        service_path: the service directory, relative to the project root (services/<stack>/<name>)
        compose_dir: the directory of the generated Compose file, relative to the project root

    Returns:
        struct(section, named): `section` is the YAML for the service (named volumes carry a marker line that
        generate_app_compose_from_entries turns into top-level declarations), "" when there are none; `named` lists the
        named volumes.
    """
    volumes = manifest.get('volumes') if manifest else None
    if volumes == None or manifest.get('appType') != 'bring-your-own':
        return struct(section = "", named = [])
    if type(volumes) != "list":
        fail("MANIFEST ERROR: 'volumes' must be a list such as [{\"source\": \"data\", \"target\": \"/data\"}]")

    up = '/'.join(['..'] * len([p for p in compose_dir.split('/') if p and p != '.']))
    named = []
    markers = []
    lines = []
    targets = []
    for i, entry in enumerate(volumes):
        field = "volumes[{}]".format(i)
        if type(entry) != "dict":
            fail("MANIFEST ERROR: '{}' must be an object such as {{\"source\": \"data\", \"target\": \"/data\"}}".format(field))
        source = entry.get('source')
        target = entry.get('target')
        read_only = entry.get('readOnly', False)
        docker_name = entry.get('name')
        selinux = entry.get('selinux')
        if type(target) != "string" or not target.startswith('/') or not _only(target, _PATH_CHARS) or '/../' in target + '/':
            fail("MANIFEST ERROR: '{}.target' must be an absolute path in the container such as /data".format(field))
        if target in targets:
            fail("MANIFEST ERROR: '{}.target' {} is mounted twice".format(field, target))
        targets.append(target)
        if type(read_only) != "bool":
            fail("MANIFEST ERROR: '{}.readOnly' must be true or false".format(field))
        if type(source) != "string" or not source:
            fail("MANIFEST ERROR: '{}.source' must be a volume name such as data, or a path such as ./config".format(field))
        variable = _source_variable(source)
        if variable != None:
            if not variable[0]:
                fail("MANIFEST ERROR: '{}.source' variables must be ${{NAME}}, ${{NAME:-./path}} or ${{NAME-./path}}, optionally followed by /sub/path, with a default path starting with ./ or ../".format(field))
            # A bare ${NAME} takes the path from the .env (an absolute path); "./" stands in for the checks below.
            source = variable[2] or "./"
        if selinux != None:
            if selinux not in ["z", "Z"]:
                fail("MANIFEST ERROR: '{}.selinux' must be z (shared) or Z (private)".format(field))
            if not _is_bind(source):
                fail("MANIFEST ERROR: '{}.selinux' only applies to a bind mount".format(field))
        if docker_name != None:
            if type(docker_name) != "string" or not docker_name or not _only(docker_name, _DOCKER_NAME_CHARS) or docker_name[0] in "_.-":
                fail("MANIFEST ERROR: '{}.name' must be a Docker volume name such as myapp_data".format(field))
            if _is_bind(source):
                fail("MANIFEST ERROR: '{}.name' only applies to a named volume, not a bind mount".format(field))
        if _is_bind(source):
            if not _only(source, _PATH_CHARS):
                fail("MANIFEST ERROR: '{}.source' must be a path such as ./config".format(field))
            host = _bind_path(source, service_path, field + ".source")
            host = (up + '/' + host) if host else up
            if variable != None:
                # Compose fills the variable in; the resolved default is what it uses when the variable is unset.
                # A bare ${NAME} is written as ${NAME:?...}, so Compose stops when it is unset or empty instead of mounting
                # "/redis" (an absolute host path outside the project) from "${STORAGE_DIR}/redis".
                host = "${" + variable[0] + (variable[1] + host if variable[1] else ":?" + variable[0] + " is not set, add an absolute path to .env") + "}" + variable[3]
        else:
            if not _only(source, _NAME_CHARS) or source[0] in "_-":
                fail("MANIFEST ERROR: '{}.source' must be a volume name (lowercase letters, digits, '-' and '_') or a path starting with ./".format(field))
            host = source
            if source not in named:
                named.append(source)
                markers.append("    {}{}{}".format(VOLUME_MARKER, source, (" " + docker_name) if docker_name else ""))
        mode = ",".join(([("ro")] if read_only else []) + ([selinux] if selinux else []))
        line = "{}:{}{}".format(host, target, (":" + mode) if mode else "")
        # A variable is quoted, so its braces and `:-` stay one YAML string.
        lines.append('      - "{}"'.format(line) if variable != None else "      - " + line)

    if not lines:
        return struct(section = "", named = [])
    return struct(section = "\n".join(markers + ["    volumes:"] + lines) + "\n", named = named)
