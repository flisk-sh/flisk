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
# Each value is checked character by character, because it is written into the generated Compose YAML as it is. Keep in step
# with volumesErrors in cli/src/utils/service-manifest.ts. This file has no load() on purpose.
# =============================================================================

VOLUME_MARKER = "# flisk-byo-volume: "

_NAME_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789_-"
_PATH_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-/"
_DOCKER_NAME_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-"


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
        if type(target) != "string" or not target.startswith('/') or not _only(target, _PATH_CHARS) or '/../' in target + '/':
            fail("MANIFEST ERROR: '{}.target' must be an absolute path in the container such as /data".format(field))
        if target in targets:
            fail("MANIFEST ERROR: '{}.target' {} is mounted twice".format(field, target))
        targets.append(target)
        if type(read_only) != "bool":
            fail("MANIFEST ERROR: '{}.readOnly' must be true or false".format(field))
        if type(source) != "string" or not source:
            fail("MANIFEST ERROR: '{}.source' must be a volume name such as data, or a path such as ./config".format(field))
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
        else:
            if not _only(source, _NAME_CHARS) or source[0] in "_-":
                fail("MANIFEST ERROR: '{}.source' must be a volume name (lowercase letters, digits, '-' and '_') or a path starting with ./".format(field))
            host = source
            if source not in named:
                named.append(source)
                markers.append("    {}{}{}".format(VOLUME_MARKER, source, (" " + docker_name) if docker_name else ""))
        lines.append("      - {}:{}{}".format(host, target, ":ro" if read_only else ""))

    if not lines:
        return struct(section = "", named = [])
    return struct(section = "\n".join(markers + ["    volumes:"] + lines) + "\n", named = named)
