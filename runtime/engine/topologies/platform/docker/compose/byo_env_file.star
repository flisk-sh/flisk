# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# Extra env files for a bring-your-own resource (service.json `envFile`).
# A Compose stack keeps its settings in a `.env` next to the compose file (Lychee: ../../../.env). Each path is relative to the
# service directory and must stay inside the project. It is written as `required: false`, so a missing file is not an error when
# Compose starts. Each value is checked character by character, because it is written into the generated Compose YAML as it is.
# Keep in step with envFileErrors in cli/src/utils/service-manifest.ts. This file has no load() on purpose.
# =============================================================================

_PATH_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-/"


def _only(value, chars):
    for c in value.elems():
        if c not in chars:
            return False
    return True


def byo_env_file_lines(manifest, service_path, compose_dir):
    """Compose `env_file:` list items (after the generated env file) for service.json `envFile` on a bring-your-own resource.

    Args:
        manifest: the service.json
        service_path: the service directory, relative to the project root
        compose_dir: the directory of the generated Compose file, relative to the project root

    Returns:
        The YAML list items, indented for a service entry, or "" when there are none.
    """
    env_files = manifest.get('envFile') if manifest else None
    if env_files == None or manifest.get('appType') != 'bring-your-own':
        return ""
    if type(env_files) != "list":
        fail("MANIFEST ERROR: 'envFile' must be a list of paths such as [\"../../../.env\"]")

    up = '/'.join(['..'] * len([p for p in compose_dir.split('/') if p and p != '.']))
    lines = []
    for i, source in enumerate(env_files):
        field = "envFile[{}]".format(i)
        if type(source) != "string" or not source or source.startswith('/') or source.endswith('/') or not _only(source, _PATH_CHARS):
            fail("MANIFEST ERROR: '{}' must be a relative file path such as ../../../.env".format(field))
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
        if not parts:
            fail("MANIFEST ERROR: '{}' must be a file inside the project such as ../../../.env".format(field))
        host = '/'.join(parts)
        lines.append("      - path: {}".format(up + '/' + host if up else host))
        lines.append("        required: false")
    return "\n".join(lines) + "\n" if lines else ""
