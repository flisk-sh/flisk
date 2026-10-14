# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
"""
L1 Base Layers - OS and Runtime Environment Foundation

Provides the foundational layers for all Dockerfiles:
- l1_os_base: Alpine Linux base with essential tools
- l1_runtime_env: Runtime environment variables
"""

BUN_BASE = "oven/bun:1.3.11-alpine"
ALPINE_BASE = "alpine:3.22"
load('../../../../../discovery/config.star', 'GLOBAL_CONFIG')

# Load project name for dynamic golden image naming
# Use TDK_PROJECT_ROOT env var set by Tilt, fallback to current directory
def _load_golden_prefix():
    project_root = os.environ.get('TDK_PROJECT_ROOT', '')
    project_json_path = '.tdk/project.json'
    if project_root:
        project_json_path = project_root + '/' + project_json_path
    
    if os.path.exists(project_json_path):
        _project_json = read_json(project_json_path)
        return _project_json.get('project', {}).get('name', 'tdk-project')
    return 'tdk-project'

_GOLDEN_PREFIX = _load_golden_prefix()

GOLDEN_L1_IMAGE = GLOBAL_CONFIG['docker'].get('golden_l1_image', _GOLDEN_PREFIX + '-l1:latest')


def L1_generate_os_base(base_image = None, maintainer = None, use_golden = True):
    """
    Generate the OS base layer with Alpine Linux and essential tools.

    Args:
        base_image: Base image to use (default: {prefix}-l1:latest if use_golden=True, else Alpine 3.18)
        maintainer: Maintainer label (default: project name from project.json)
        use_golden: Whether to use the golden L1 image (default: True)

    Returns:
        Dockerfile content string for the l1_os_base stage
    """
    if base_image == None:
        base_image = GOLDEN_L1_IMAGE if use_golden else ALPINE_BASE

    # Set default maintainer from project name
    if maintainer == None:
        maintainer = _GOLDEN_PREFIX

    # If using golden L1 image, skip dependency installation (already in base)
    if base_image == GOLDEN_L1_IMAGE or _GOLDEN_PREFIX + "-l1" in base_image:
        return (
            "# ---- L1: os_base (Golden L1: " + base_image + ") ----\n"
            + "FROM " + base_image + " AS l1_os_base\n"
            + "# OS dependencies pre-installed in golden L1 image\n"
            + "WORKDIR /app\n"
        )
    
    # Standard base with dependency installation
    return (
        "# ---- L1: os_base (" + base_image + ") ----\n"
        + "FROM " + base_image + " AS l1_os_base\n"
        + "LABEL maintainer=\"" + maintainer + "\"\n"
        + "RUN apk add --no-cache ca-certificates tzdata curl bash openssl \\\n"
        + "    && addgroup -S app && adduser -S app -G app\n"
        + "WORKDIR /app\n"
    )


def L1_generate_runtime_env(envs = None):
    """
    Generate the runtime environment variables layer.
    
    Args:
        envs: Dictionary of environment variables (default: production settings)
    
    Returns:
        Dockerfile content string for the l1_runtime_env stage
    """
    if envs == None:
        envs = {"NODE_ENV": "production", "BUN_INSTALL_CACHE_DIR": "/cache/bun"}
    parts = ["# ---- L1: runtime_env ----\n", "# Shared runtime environment\n"]
    for k in envs:
        parts.append("ENV " + k + "=" + envs[k] + "\n")
    return "".join(parts)

GLOBAL_CONFIG = {}
