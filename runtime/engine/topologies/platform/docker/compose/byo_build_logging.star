# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# Build arguments and logging for a bring-your-own resource (service.json `buildArgs` and `logging`).
# A Compose stack passes build arguments to its Dockerfile (`build.args`, often from the .env: `${NODE_VERSION:-22}`) and caps
# its container logs (`logging: {driver: json-file, options: {max-size: 5m, max-file: "5"}}`, wger). Values are written as
# JSON strings, which YAML reads as double-quoted strings, so text and Compose variables reach Compose as written and nothing
# can add a key. Names, the driver and option keys are checked character by character. Keep in step with buildArgsErrors and
# loggingErrors in cli/src/utils/service-manifest.ts. This file has no load() on purpose.
# =============================================================================

_NAME_START = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_"
_NAME_CHARS = _NAME_START + "0123456789"
_DRIVER_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789_.-"
_OPTION_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-"
_CONTROL = [chr(i) for i in range(32)] + [chr(127), "\u0085", " ", " "]


def _only(value, chars):
    if type(value) != "string" or not value:
        return False
    for c in value.elems():
        if c not in chars:
            return False
    return True


def _plain_text(value):
    if type(value) != "string":
        return False
    for bad in _CONTROL:
        if bad in value:
            return False
    return True


def byo_build_args_lines(manifest):
    """`      args:` and its entries for the service's `build:` block, from service.json `buildArgs`, or "" when there are none."""
    args = manifest.get('buildArgs') if manifest else None
    if args == None or manifest.get('appType') != 'bring-your-own':
        return ""
    if type(args) != "dict":
        fail("MANIFEST ERROR: 'buildArgs' must be an object of string values such as {\"NODE_VERSION\": \"22\"}")
    lines = []
    for name in sorted(args.keys()):
        if not _only(name, _NAME_CHARS) or name[0] not in _NAME_START:
            fail("MANIFEST ERROR: 'buildArgs' names must be letters, digits or _, not starting with a digit")
        if not _plain_text(args[name]):
            fail("MANIFEST ERROR: 'buildArgs.{}' must be a string without line breaks or control characters".format(name))
        lines.append("        {}: {}".format(name, encode_json(args[name]).strip()))
    if not lines:
        return ""
    return "\n".join(["      args:"] + lines) + "\n"


def byo_logging_section(manifest):
    """The service's `logging:` block from service.json `logging`, or "" when it is not set."""
    logging = manifest.get('logging') if manifest else None
    if logging == None or manifest.get('appType') != 'bring-your-own':
        return ""
    if type(logging) != "dict":
        fail("MANIFEST ERROR: 'logging' must be an object such as {\"driver\": \"json-file\", \"options\": {\"max-size\": \"5m\"}}")
    for key in logging.keys():
        if key not in ["driver", "options"]:
            fail("MANIFEST ERROR: 'logging.{}' is not a logging option (use driver, options)".format(key))
    driver = logging.get('driver')
    options = logging.get('options')
    lines = ["    logging:"]
    if driver != None:
        if not _only(driver, _DRIVER_CHARS) or driver[0] in "_.-":
            fail("MANIFEST ERROR: 'logging.driver' must be a driver name such as json-file or local")
        lines.append("      driver: {}".format(driver))
    if options != None:
        if type(options) != "dict":
            fail("MANIFEST ERROR: 'logging.options' must be an object of string values such as {\"max-size\": \"5m\"}")
        if options:
            lines.append("      options:")
        for key in sorted(options.keys()):
            if not _only(key, _OPTION_CHARS) or key[0] in "_.-":
                fail("MANIFEST ERROR: 'logging.options' keys must be letters, digits, '-', '_' and '.', such as max-size")
            if not _plain_text(options[key]):
                fail("MANIFEST ERROR: 'logging.options.{}' must be a string without line breaks or control characters".format(key))
            lines.append("        {}: {}".format(key, encode_json(options[key]).strip()))
    if len(lines) == 1:
        return ""
    return "\n".join(lines) + "\n"
