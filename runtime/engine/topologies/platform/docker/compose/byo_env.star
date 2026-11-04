# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# Plain environment for a bring-your-own resource (service.json `env`, #2923).
# Secrets come from the git-ignored project .env through `secrets`; everything else (a database name, another service's URL,
# a proxy address) belongs in the committed service.json, so a fresh clone recreates the stack. Values may use ${VAR} and
# ${VAR:-default}, which Compose resolves from the project .env, as for command services. Each entry is written as one
# JSON-quoted YAML string, so a value cannot add keys. Keep in step with byoEnvErrors in cli/src/utils/service-manifest.ts.
# This file has no load() on purpose.
# =============================================================================

_NAME_START = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_"
_NAME_CHARS = _NAME_START + "0123456789"
_CONTROL = [chr(i) for i in range(32)] + [chr(127), "\u0085", " ", " "]


def _valid_name(name):
    if type(name) != "string" or not name or name[0] not in _NAME_START:
        return False
    for c in name.elems():
        if c not in _NAME_CHARS:
            return False
    return True


def byo_environment_lines(manifest):
    """Compose `environment:` list lines (each starting with a newline) for service.json `env`, or '' when there is none.

    Only bring-your-own resources read `env` here; a command service passes it to its process (cli/src/utils/native-up.ts).
    """
    env = manifest.get('env') if manifest else None
    if env == None or manifest.get('appType') != 'bring-your-own':
        return ''
    if type(env) != "dict":
        fail("MANIFEST ERROR: 'env' must be an object of string values")
    lines = ''
    for name in sorted(env.keys()):
        value = env[name]
        if not _valid_name(name):
            fail("MANIFEST ERROR: 'env' names must be letters, digits or _, not starting with a digit")
        if type(value) != "string":
            fail("MANIFEST ERROR: 'env.{}' must be a string".format(name))
        for bad in _CONTROL:
            if bad in value:
                fail("MANIFEST ERROR: 'env.{}' must not contain line breaks or control characters".format(name))
        lines += '\n      - ' + encode_json(name + '=' + value).strip()
    return lines
