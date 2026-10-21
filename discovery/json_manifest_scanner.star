# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
# json_manifest_scanner.star
# 
# Purpose: Low-level JSON manifest file discovery using shell `find` command
# Use: discover_json_manifests(root_path) returns list of manifest file paths
#
# NOTE: This is the "manual" scanner - it finds files in a specific folder.
# For auto-discovery from Tilt's discovery system, use discovery.star instead.

load("./manifest/constants.star", "MANIFEST_FILENAME")

def discover_json_manifests(root_path):
    """
    Discover all JSON manifest files in a given root path.
    
    Args:
        root_path: Path relative to project root (e.g., "services/product")
                   or absolute path. Uses TDK_PROJECT_ROOT env var if set.
                   Supports glob patterns like "identity-*" for flat structures.
    
    Returns:
        List of manifest file paths (strings)
    """
    # Get project root from environment variable set by main Tiltfile
    project_root = os.environ.get('TDK_PROJECT_ROOT', '.')
    
    # Check if root_path contains glob patterns
    if '*' in root_path or '?' in root_path:
        # Use bash to expand glob and find files
        # The pattern like identity-* needs shell expansion
        cmd = "cd " + project_root + " && bash -c 'for dir in " + root_path + "; do if [ -d \"$dir\" ]; then find \"$dir\" -maxdepth 3 -type f -name \"" + MANIFEST_FILENAME + "\" 2>/dev/null; fi; done'"
        result = str(local(cmd, quiet=True, echo_off=True))
    else:
        # Keep discovery results project-relative whenever possible.
        # Running `find` on an absolute `project_root/../sibling` path makes find
        # emit absolute paths; stripping the leading "/" later produces bogus
        # Docker context paths like `private/var/www/.../platform/verdaccio`.
        if root_path.startswith('/'):
            cmd = "find " + root_path + " -type f -name '" + MANIFEST_FILENAME + "' 2>/dev/null | sort"
        else:
            cmd = (
                "cd " + project_root +
                " && find " + root_path +
                " -type f -name '" + MANIFEST_FILENAME + "' 2>/dev/null | sort"
            )
        result = str(local(cmd, quiet=True, echo_off=True))
    
    manifests = []
    if result:
        lines = result.strip().split("\n")
        for line in lines:
            line = line.strip()
            if line and MANIFEST_FILENAME in line:
                manifests.append(line)
    
    return manifests
