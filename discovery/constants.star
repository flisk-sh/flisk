# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📍 TOPOLOGIES - DISCOVERY CONSTANTS
# =============================================================================

# Import manifest filename from local manifest folder (self-contained)
load("./manifest/constants.star", 
    _manifest_file="MANIFEST_FILENAME", 
    _manifest_file_yaml="MANIFEST_FILENAME_YAML"
)

# Re-export for consumers of this module
MANIFEST_FILENAME = _manifest_file
MANIFEST_FILENAME_YAML = _manifest_file_yaml

# NOTE: These paths are resolved relative to the TILTFILE directory (project root)
# NOT relative to this module's location
RESOURCES_ROOT = "services/product"
RESOURCES_ROOT_PREFIX = ""

# Check for project-specific discovery patterns
def _get_project_discovery_roots():
    """Get discovery roots from project spec.master if available."""
    project_root = os.environ.get('TDK_PROJECT_ROOT', '')
    if not project_root:
        return []
    
    # Try to read spec.master for custom discovery patterns
    spec_paths = [
        project_root + "/.tdk/.tdk-out/spec.master",
        project_root + "/spec.master",
    ]
    
    for spec_path in spec_paths:
        check_cmd = "test -f '{}' && echo 'yes' || echo 'no'".format(spec_path)
        exists = str(local(check_cmd, quiet=True, echo_off=True)).strip() == 'yes'
        if exists:
            # Read and parse spec.master for RESOURCE_PATTERNS
            spec_content = str(read_file(spec_path, default=""))
            if "RESOURCE_PATTERNS" in spec_content:
                # Extract patterns from the array
                start = spec_content.find("RESOURCE_PATTERNS = [")
                if start != -1:
                    start = spec_content.find("[", start)
                    end = spec_content.find("]", start)
                    if start != -1 and end != -1:
                        array_content = spec_content[start+1:end]
                        patterns = []
                        for part in array_content.split(","):
                            part = part.strip().strip("'").strip('"').strip()
                            if part and not part.startswith("#"):
                                patterns.append(part)
                        if patterns:

                            return patterns
    return []

# Get project-specific roots or fall back to defaults
_PROJECT_DISCOVERY_ROOTS = _get_project_discovery_roots()

def _get_enabled_project_stacks():
    """Read enabled stack names from .tdk/project.json phases.*.enabledStacks."""
    project_root = os.environ.get('TDK_PROJECT_ROOT', '')
    if not project_root:
        return []

    project_config_path = project_root + "/.tdk/project.json"
    exists = str(local("test -f '{}' && echo 'yes' || echo 'no'".format(project_config_path), quiet=True, echo_off=True)).strip() == 'yes'
    if not exists:
        return []

    project_config = read_json(project_config_path)
    phases = project_config.get("phases", {})
    enabled = []
    seen = {}
    for phase_name in ["pre_alpha", "alpha", "beta"]:
        phase = phases.get(phase_name, {})
        for stack in phase.get("enabledStacks", []):
            if stack and stack not in seen:
                enabled.append(stack)
                seen[stack] = True
    return enabled

def _expand_enabled_stack_roots(roots):
    """Narrow broad services/*/* discovery to the stacks enabled in project.json."""
    enabled_stacks = _get_enabled_project_stacks()
    if not enabled_stacks:
        return roots

    expanded = []
    for root in roots:
        if root == "services/*/*":
            for stack in enabled_stacks:
                expanded.append("services/" + stack)
        else:
            expanded.append(root)
    return expanded

# Phase 2: Universal Discovery - Scan roots configuration
# Each root is scanned for service.json files
# Paths are relative to PROJECT_ROOT (where Tiltfile is located)
_DISCOVERY_ROOTS_RAW = _expand_enabled_stack_roots(_PROJECT_DISCOVERY_ROOTS) if _PROJECT_DISCOVERY_ROOTS else [
    RESOURCES_ROOT,                           # services/product/*/*/
    "services/platform",                     # services/platform/*/*/
    "shared-product-engineering",            # shared-product-engineering/*/
    "cli-platform-engineering",              # cli-platform-engineering/*/
]

# SAFETY: Filter out tdk-cli's own directories to prevent self-modification
# The CLI should never scan or write to its own installation directory
def _filter_cli_dirs(roots):
    """Remove tdk-cli internal directories from scan roots."""
    filtered = []
    for root in roots:
        # Skip if path contains tdk-cli internal paths
        if "tdk-cli" in root and "discovery" in root:
            print("⚠️  Skipping tdk-cli internal directory: {}".format(root))
            continue
        if root.startswith("discovery/") or root == "discovery":
            print("⚠️  Skipping discovery directory: {}".format(root))
            continue
        filtered.append(root)
    return filtered

DISCOVERY_SCAN_ROOTS = _filter_cli_dirs(_DISCOVERY_ROOTS_RAW)

# Phase 2: Explicit stack extraction patterns for each root type
# Documents HOW to extract stack from different directory structures
SCAN_ROOT_PATTERNS = {
    RESOURCES_ROOT: {
        "stack_depth": -3,  # services/product/{STACK}/{service}/
        "description": "Stack-grouped services (product)"
    },
    "services/platform": {
        "stack_depth": -2,  # services/platform/{SERVICE}/ (flat)
        "description": "Flat platform services"
    },
    "shared-product-engineering": {
        "stack_depth": -2,  # shared-product-engineering/{SERVICE}/ (flat)
        "description": "Shared libraries (flat)"
    },
    "cli-platform-engineering": {
        "stack_depth": -2,  # cli-platform-engineering/{SERVICE}/ (flat)
        "description": "CLI tools (flat)"
    },
}

# Phase 2: Performance guardrails (Phase 3 optimization baseline)
MAX_SCAN_TIMEOUT_MS = 5000    # 5 seconds per root (warn if exceeded)
MAX_MANIFESTS_PER_ROOT = 110  # Warn if root has more manifests

# Autogenerated files directory (relative to this file's location)
PRODUCT_SNAPSHOT_DIR = ".tdk/.tdk-out/product_autogenerated_resource_manifests"

PRODUCT_SNAPSHOT_FILES = {
    "services": "services.autogenerated.star",
    "dependencies": "resource_dependencies.autogenerated.star",
    "aliases": "resource_aliases.autogenerated.star",
    "paths": "resource_paths.autogenerated.star",
    "index": "index.autogenerated.star",
    "readme": "README.autogenerated.md",
}

PRODUCT_TOPOLOGY_DIR = ".tdk/.tdk-out/product_autogenerated_services_list"
PRODUCT_STACKS_INDEX_FILE = "stacks.autogenerated.star"
PRODUCT_STACK_RESOURCES_FILE = "resources.autogenerated.star"
