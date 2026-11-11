# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# Shared image reference of the wake gateway (flisk#3837)
# =============================================================================
# The image has nothing project specific in it, so every project on a machine
# uses one name, tagged by what is in it: `flisk-wake-gateway:<tilt version>-<hash>`.
# Docker then keeps one copy (257 MB of unique layers) instead of one per project, and
# a change to the Dockerfile, the pinned Tilt version or the gateway sources makes
# a new tag. The hash is computed in Starlark (no shell, so it also works on Windows).

WAKE_GATEWAY_IMAGE_REPOSITORY = "flisk-wake-gateway"

# The vendored copy of the engine's gateway directory, relative to the project root (Tilt's working directory).
WAKE_GATEWAY_VENDORED_DIR = ".flisk/.flisk-out/flisk-cli-ext/engine/assets/docker/wake-gateway"

# Everything the Dockerfile copies or builds from. Add a file here when the Dockerfile starts to COPY it.
WAKE_GATEWAY_SOURCE_FILES = ["Dockerfile", "decide.ts", "server.ts"]

_UNKNOWN_TILT_VERSION = "unknown"


def _tilt_version(dockerfile_text):
    """The default of `ARG TILT_VERSION=` in the Dockerfile: the Tilt CLI the image carries."""
    for line in dockerfile_text.splitlines():
        stripped = line.strip()
        if stripped.startswith("ARG TILT_VERSION="):
            return stripped[len("ARG TILT_VERSION="):].strip()
    return _UNKNOWN_TILT_VERSION


def _hex8(value):
    digits = "0123456789abcdef"
    value = value & 0xffffffff
    out = ""
    for _ in range(8):
        out = digits[value & 0xf] + out
        value = value >> 4
    return out


def wake_gateway_image_tag(contents):
    """Tag from `{file name: text}`: `<tilt version>-<16 hex digits over every file's name, length and content>`."""
    parts = []
    for name in WAKE_GATEWAY_SOURCE_FILES:
        text = contents.get(name, "")
        parts.append("{}:{}:{}".format(name, len(text), text))
    joined = "\n--\n".join(parts)
    digest = _hex8(hash(joined)) + _hex8(hash("flisk-wake-gateway\n" + joined))
    return "{}-{}".format(_tilt_version(contents.get("Dockerfile", "")), digest)


def wake_gateway_image(source_dir = WAKE_GATEWAY_VENDORED_DIR):
    """`flisk-wake-gateway:<tag>`, the same string in every project whose gateway sources are the same."""
    contents = {}
    for name in WAKE_GATEWAY_SOURCE_FILES:
        contents[name] = str(read_file(source_dir + "/" + name, default = ""))
    return "{}:{}".format(WAKE_GATEWAY_IMAGE_REPOSITORY, wake_gateway_image_tag(contents))
