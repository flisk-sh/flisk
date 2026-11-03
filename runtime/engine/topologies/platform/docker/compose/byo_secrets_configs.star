# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# Secrets and configs for a bring-your-own resource (service.json `secrets.files`
# and `configs`, #3059).
# =============================================================================

SECRET_MARKER = "# flisk-byo-secret: "
CONFIG_MARKER = "# flisk-byo-config: "

_ALNUM = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
_NAME_CHARS = _ALNUM + "_.-"
_PATH_CHARS = _ALNUM + "_.-/"


def _only(value, chars):
    for c in value.elems():
        if c not in chars:
            return False
    return True


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


def byo_secrets_configs(manifest, service_path, compose_dir):
    """Compose `secrets:` and `configs:` lines for service.json on a bring-your-own resource.

    Args:
        manifest: the service.json
        service_path: the service directory, relative to the project root (services/<stack>/<name>)
        compose_dir: the directory of the generated Compose file, relative to the project root

    Returns:
        The YAML section for the service (including marker lines for top-level collection), or "" when none.
    """
    if not manifest or manifest.get('appType') != 'bring-your-own':
        return ""

    up = '/'.join(['..'] * len([p for p in compose_dir.split('/') if p and p != '.']))

    markers = []
    lines = []

    # 1. Secrets (manifest.secrets.files)
    secrets_obj = manifest.get('secrets')
    secret_files = []
    if type(secrets_obj) == "dict":
        raw_files = secrets_obj.get('files')
        if raw_files != None:
            if type(raw_files) != "list":
                fail("MANIFEST ERROR: 'secrets.files' must be a list such as [{\"name\": \"sec\", \"source\": \"./sec\", \"target\": \"/run/secrets/sec\"}]")
            secret_files = raw_files

    if secret_files:
        lines.append("    secrets:")
        for i, entry in enumerate(secret_files):
            field = "secrets.files[{}]".format(i)
            if type(entry) != "dict":
                fail("MANIFEST ERROR: '{}' must be an object".format(field))
            name = entry.get('name')
            source = entry.get('source')
            target = entry.get('target')
            uid = entry.get('uid')
            gid = entry.get('gid')
            mode = entry.get('mode')

            if type(name) != "string" or not name or name[0] not in _ALNUM or not _only(name, _NAME_CHARS):
                fail("MANIFEST ERROR: '{}.name' must be a secret name (letters, digits, '-', '_' and '.')".format(field))
            if type(source) != "string" or not source or not _only(source, _PATH_CHARS):
                fail("MANIFEST ERROR: '{}.source' must be a relative file path".format(field))
            if target != None and (type(target) != "string" or not target.startswith('/') or not _only(target, _PATH_CHARS)):
                fail("MANIFEST ERROR: '{}.target' must be an absolute path in the container".format(field))

            host = _bind_path(source, service_path, field + ".source")
            host_path = (up + '/' + host) if host else up
            markers.append("    {}{}{}".format(SECRET_MARKER, name + " ", host_path))

            default_target = "/run/secrets/" + name
            is_short = (target == None or target == default_target) and uid == None and gid == None and mode == None
            if is_short:
                lines.append("      - {}".format(name))
            else:
                lines.append("      - source: {}".format(name))
                lines.append("        target: {}".format(target if target != None else default_target))
                if uid != None:
                    lines.append('        uid: "{}"'.format(uid))
                if gid != None:
                    lines.append('        gid: "{}"'.format(gid))
                if mode != None:
                    if type(mode) == "int":
                        lines.append("        mode: {}".format(mode))
                    else:
                        lines.append('        mode: "{}"'.format(mode))

    # 2. Configs (manifest.configs)
    raw_configs = manifest.get('configs')
    config_files = []
    if raw_configs != None:
        if type(raw_configs) != "list":
            fail("MANIFEST ERROR: 'configs' must be a list such as [{\"name\": \"cfg\", \"source\": \"./cfg\", \"target\": \"/cfg\"}]")
        config_files = raw_configs

    if config_files:
        lines.append("    configs:")
        for i, entry in enumerate(config_files):
            field = "configs[{}]".format(i)
            if type(entry) != "dict":
                fail("MANIFEST ERROR: '{}' must be an object".format(field))
            name = entry.get('name')
            source = entry.get('source')
            target = entry.get('target')
            uid = entry.get('uid')
            gid = entry.get('gid')
            mode = entry.get('mode')

            if type(name) != "string" or not name or name[0] not in _ALNUM or not _only(name, _NAME_CHARS):
                fail("MANIFEST ERROR: '{}.name' must be a config name (letters, digits, '-', '_' and '.')".format(field))
            if type(source) != "string" or not source or not _only(source, _PATH_CHARS):
                fail("MANIFEST ERROR: '{}.source' must be a relative file path".format(field))
            if target != None and (type(target) != "string" or not target.startswith('/') or not _only(target, _PATH_CHARS)):
                fail("MANIFEST ERROR: '{}.target' must be an absolute path in the container".format(field))

            host = _bind_path(source, service_path, field + ".source")
            host_path = (up + '/' + host) if host else up
            markers.append("    {}{}{}".format(CONFIG_MARKER, name + " ", host_path))

            default_target = "/" + name
            is_short = (target == None or target == default_target) and uid == None and gid == None and mode == None
            if is_short:
                lines.append("      - {}".format(name))
            else:
                lines.append("      - source: {}".format(name))
                lines.append("        target: {}".format(target if target != None else default_target))
                if uid != None:
                    lines.append('        uid: "{}"'.format(uid))
                if gid != None:
                    lines.append('        gid: "{}"'.format(gid))
                if mode != None:
                    if type(mode) == "int":
                        lines.append("        mode: {}".format(mode))
                    else:
                        lines.append('        mode: "{}"'.format(mode))

    if not lines:
        return ""
    return "\n".join(markers + lines) + "\n"
