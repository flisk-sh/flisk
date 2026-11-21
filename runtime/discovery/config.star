#!/usr/bin/env starlark
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🗺️ TOPOLOGIES - DISCOVERY CONFIG
# =============================================================================

load("./native_windows.star", "file_exists")
load("./constants.star", "RESOURCES_ROOT")
load("../engine/topologies/platform/docker/constants.star", "PlatformDockerConstants")

# NOTE: DEFAULTS and focus lists are now loaded dynamically in resource_registry.star
# from the project's spec.master (using FLISK_PROJECT_ROOT environment variable).
# This allows per-project resource configuration.

# Default empty values - will be populated by _load_project_defaults() in resource_registry.star
DEFAULTS = {}
FOCUS_PRE_ALPHA = []
FOCUS_ALPHA = []
FOCUS_BETA = []

# Export a function to load project-specific defaults
def load_project_defaults(project_root):
    """
    Load DEFAULTS and focus lists from project spec.master.
    Called by resource_registry.star during initialization.
    
    Returns struct with loaded values or None if spec.master not found.
    """
    if not project_root:
        return None
    
    # Check multiple locations for spec.master (in order of preference)
    spec_paths = [
        project_root + "/.flisk/.flisk-out/generated/spec.master",  # New unified output folder
        project_root + "/spec.master",                       # Original location (legacy)
    ]
    
    spec_path = None
    for path in spec_paths:
        exists = file_exists(path)
        if exists:
            spec_path = path
            break
    
    if not spec_path:
        return None
    
    # Read and parse the spec.master file
    # Since we can't dynamically load, we parse it manually
    spec_content_raw = read_file(spec_path, default="")
    if not spec_content_raw:
        return None
    
    # Ensure content is a string (read_file may return bytes)
    spec_content = str(spec_content_raw)
    
    # Extract PRE_ALPHA_RESOURCES from the file
    # This is a simple parser for the expected format
    defaults = {}
    pre_alpha = []
    alpha = []
    beta = []
    
    # Parse PRE_ALPHA_RESOURCES
    if "PRE_ALPHA_RESOURCES" in spec_content:
        # Extract the dict content between { and }
        start = spec_content.find("PRE_ALPHA_RESOURCES = {")
        if start != -1:
            start = spec_content.find("{", start)
            end = spec_content.find("}", start)
            if start != -1 and end != -1:
                dict_content = spec_content[start+1:end]
                # Parse "key": True/False entries
                for line in dict_content.split("\n"):
                    line = line.strip()
                    if line and not line.startswith("#"):
                        # Extract key before colon
                        if '"' in line or "'" in line:
                            # Find quoted key
                            quote_char = '"' if '"' in line else "'"
                            key_start = line.find(quote_char)
                            key_end = line.find(quote_char, key_start + 1)
                            if key_start != -1 and key_end != -1:
                                key = line[key_start+1:key_end]
                                # Check if value is True
                                if "True" in line:
                                    defaults[key] = True
                                    pre_alpha.append(key)
    
    # Parse ALPHA_RESOURCES
    if "ALPHA_RESOURCES" in spec_content:
        start = spec_content.find("ALPHA_RESOURCES = {")
        if start != -1:
            start = spec_content.find("{", start)
            end = spec_content.find("}", start)
            if start != -1 and end != -1:
                dict_content = spec_content[start+1:end]
                for line in dict_content.split("\n"):
                    line = line.strip()
                    if line and not line.startswith("#"):
                        if '"' in line or "'" in line:
                            quote_char = '"' if '"' in line else "'"
                            key_start = line.find(quote_char)
                            key_end = line.find(quote_char, key_start + 1)
                            if key_start != -1 and key_end != -1:
                                key = line[key_start+1:key_end]
                                if "True" in line:
                                    defaults[key] = True
                                    alpha.append(key)
    
    # Parse BETA_RESOURCES
    if "BETA_RESOURCES" in spec_content:
        start = spec_content.find("BETA_RESOURCES = {")
        if start != -1:
            start = spec_content.find("{", start)
            end = spec_content.find("}", start)
            if start != -1 and end != -1:
                dict_content = spec_content[start+1:end]
                for line in dict_content.split("\n"):
                    line = line.strip()
                    if line and not line.startswith("#"):
                        if '"' in line or "'" in line:
                            quote_char = '"' if '"' in line else "'"
                            key_start = line.find(quote_char)
                            key_end = line.find(quote_char, key_start + 1)
                            if key_start != -1 and key_end != -1:
                                key = line[key_start+1:key_end]
                                if "True" in line:
                                    defaults[key] = True
                                    beta.append(key)
    
    return struct(
        DEFAULTS = defaults,
        FOCUS_PRE_ALPHA = pre_alpha,
        FOCUS_ALPHA = pre_alpha + alpha,
        FOCUS_BETA = pre_alpha + alpha + beta,
    )

# -----------------------------------------------------------------------------
# 🧭 VERDACCIO AVAILABILITY
# -----------------------------------------------------------------------------
# The free-tier loader is a no-op stub: setting FLISK_LICENSE_KEY to any string
# never starts a Verdaccio container (#3956). Scope routing must follow the
# loader that is actually vendored into the project, plus an explicit project
# opt-in, so an arbitrary key cannot rewrite the generated registry config.

VERDACCIO_FREE_LOADER_MARKER = "VERDACCIO_LOADER_FREE_TIER_STUB"
_VERDACCIO_LOADER_REL_PATH = "engine/topologies/platform/registries/verdaccio_loader.star"


def _verdaccio_loader_path():
    """Return the vendored loader that Tilt will execute, or "" when none is found."""
    candidates = []
    project_root = os.environ.get("FLISK_PROJECT_ROOT", "")
    if project_root:
        candidates.append(
            project_root
            + "/.flisk/.flisk-out/flisk-cli-ext/"
            + _VERDACCIO_LOADER_REL_PATH
        )
    extension_path = os.environ.get("FLISK_EXTENSION_PATH", "")
    if extension_path:
        candidates.append(extension_path + "/" + _VERDACCIO_LOADER_REL_PATH)
        # Some callers point at the repository root rather than its runtime/ dir.
        candidates.append(extension_path + "/runtime/" + _VERDACCIO_LOADER_REL_PATH)
    for path in candidates:
        if file_exists(path):
            return path
    return ""


def _project_enables_verdaccio():
    """True only when the project explicitly opted into the Verdaccio resource."""
    project_root = os.environ.get("FLISK_PROJECT_ROOT", "")
    if not project_root:
        return False

    project_json_path = project_root + "/.flisk/project.json"
    if file_exists(project_json_path):
        project_json = read_json(project_json_path)
        if type(project_json) == "dict":
            optional_infra = project_json.get("optional_infra", {})
            if type(optional_infra) == "dict" and optional_infra.get("verdaccio") == True:
                return True
            phases = project_json.get("phases", {})
            if type(phases) == "dict":
                for phase_name in phases:
                    phase = phases.get(phase_name, {})
                    if type(phase) == "dict" and "verdaccio" in phase.get("enabledStacks", []):
                        return True

    # spec.master is generated from project.json, but direct Tilt runs and older
    # projects may only have it on disk. Either location is authoritative here.
    for spec_path in [
        project_root + "/.flisk/.flisk-out/generated/spec.master",
        project_root + "/.flisk/.flisk-out/spec.master",
        project_root + "/spec.master",
    ]:
        if not file_exists(spec_path):
            continue
        for line in str(read_file(spec_path, default="")).split("\n"):
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if ('"verdaccio"' in stripped or "'verdaccio'" in stripped) and "True" in stripped:
                return True
        return False
    return False


def _verdaccio_enabled():
    """Route scopes to Verdaccio only when a real loader is present and opted in."""
    if not _project_enables_verdaccio():
        return False
    loader_path = _verdaccio_loader_path()
    if not loader_path:
        return False
    # The licensed overlay is private and cannot export a marker we add here, so
    # detect the public stub by its marker and treat any other loader as real.
    return VERDACCIO_FREE_LOADER_MARKER not in str(read_file(loader_path, default=""))


# -----------------------------------------------------------------------------
# 🎛️ RESOURCE DEFAULTS
# -----------------------------------------------------------------------------
# LOADED FROM: spec.master (searched in order):
#   1. .flisk/.flisk-out/generated/spec.master (new unified output folder)
#   2. spec.master (legacy location in project root)
# PURPOSE: Single source of truth for resource enable/disable configuration
# 
# 📖 To modify which resources run, edit: spec.master
# -----------------------------------------------------------------------------


def get_global_config():
    verdaccio_url_docker = os.environ.get(
        "VERDACCIO_URL_DOCKER",
        PlatformDockerConstants.VERDACCIO_URL_DOCKER,
    )
    # A non-empty FLISK_LICENSE_KEY is not enough: the free-tier loader never
    # starts Verdaccio. Only route scopes when a real loader is vendored and
    # the project opted in; otherwise scoped packages use public npm.
    verdaccio_enabled = _verdaccio_enabled()
    return {
        "verdaccio_url_local": PlatformDockerConstants.VERDACCIO_URL_LOCAL,
        "verdaccio_url_docker": verdaccio_url_docker,
        "verdaccio_enabled": verdaccio_enabled,
        "npm_registry": PlatformDockerConstants.VERDACCIO_NPM_REGISTRY,
        "internal_scope": "@" + PlatformDockerConstants.PROJECT_NAME + "/",
        "library_roots": {
            "platform": "shared-platform-engineering",
            "product": "shared-product-engineering",
            "ddd": "shared-ddd-layers",
        },
        # Relative to .tilt/topologies/tilt/discovery/
        "resources_root": RESOURCES_ROOT,
        "database": PlatformDockerConstants.DB_CONFIG,
        "docker": {
            "base_image": PlatformDockerConstants.BUN_IMAGE,
            "golden_l1_image": PlatformDockerConstants.PROJECT_NAME_HYPHEN + "-l1:latest",
            "golden_l2_image": PlatformDockerConstants.PROJECT_NAME_HYPHEN + "-l2:latest",
            "golden_l3_backend_image": PlatformDockerConstants.PROJECT_NAME_HYPHEN + "-l3-backend:latest",
            "golden_l3_frontend_image": PlatformDockerConstants.PROJECT_NAME_HYPHEN + "-l3-frontend:latest",
            "golden_l3_migrator_image": PlatformDockerConstants.PROJECT_NAME_HYPHEN + "-l3-backend:latest",
            "golden_l4_backend_image": PlatformDockerConstants.PROJECT_NAME_HYPHEN + "-l4-backend:latest",
            "golden_l4_frontend_image": PlatformDockerConstants.PROJECT_NAME_HYPHEN + "-l4-frontend:latest",
            "golden_l4_migrator_image": PlatformDockerConstants.PROJECT_NAME_HYPHEN + "-l4-migrator:latest",
            "network_prefix": PlatformDockerConstants.PROJECT_NAME + "_",
        },
        "ports": {
            "backend": 3000,
            "frontend": 80,
            "postgres": 5432,
            "nats": 4222,
            "verdaccio": PlatformDockerConstants.VERDACCIO_PORT,
        },
    }


GLOBAL_CONFIG = get_global_config()

INFRA_RESOURCES = [
    {"name": "database-management", "memory": 1152},
    {"name": "proxy", "memory": 384},
    {"name": "api-gateway", "memory": 512},
    {"name": "verdaccio", "memory": 128},
    {"name": "infisical", "memory": 192},
    {"name": "monitoring", "memory": 1536},
    {"name": "elk", "memory": 1024},
    {"name": "debezium", "memory": 448},
]

CORE_INFRA = [
    "init-networks",
    "golden-layers-build",
    "postgres",
    "nats",
    "traefik",
]

INFRA_STACK_MAP = {
    "golden-layers-build": "golden-image",
    "postgres": "database-management",
    "nats": "database-management",
    "redis": "database-management",
    "traefik": "proxy",
    "verdaccio": "verdaccio",
    "infisical": "infisical",
}

OPTIONAL_INFRA = {
    "monitoring": ["signoz-frontend", "signoz-otel-collector", "signoz-query-service", "clickhouse", "elasticsearch", "skywalking-oap", "skywalking-ui"],
    "infisical": ["infisical", "infisical-db", "infisical-redis"],
    "elk": ["elasticsearch", "logstash", "kibana"],
    "debezium": ["kafka", "zookeeper", "nats-http-bridge", "debezium-connect", "enhanced-connector-setup"],
}

# -----------------------------------------------------------------------------
# 📚 LIBRARY DEFINITIONS
# -----------------------------------------------------------------------------
# Libraries are auto-discovered from the filesystem in libraries.star.
# Only non-auto-discoverable definitions (e.g. DDD layer paths) live here.
# -----------------------------------------------------------------------------

DDD_LIBS = [
    {"name": "domain", "path": "shared-ddd-layers/domain"},
    {"name": "infrastructure", "path": "shared-ddd-layers/infrastructure"},
    {"name": "application", "path": "shared-ddd-layers/application"},
    {"name": "presentation", "path": "shared-ddd-layers/presentation"},
]

# Export DEFAULTS and focus filters for use by other modules via Config struct
# Note: These will be populated by load_project_defaults() in resource_registry.star
Config = struct(
    load_project_defaults = load_project_defaults,
    DEFAULTS = DEFAULTS,
    FOCUS_PRE_ALPHA = FOCUS_PRE_ALPHA,
    FOCUS_ALPHA = FOCUS_ALPHA,
    FOCUS_BETA = FOCUS_BETA,
    GLOBAL = GLOBAL_CONFIG,
    INFRA_RESOURCES = INFRA_RESOURCES,
    CORE_INFRA = CORE_INFRA,
    INFRA_STACK_MAP = INFRA_STACK_MAP,
    OPTIONAL_INFRA = OPTIONAL_INFRA,
    DDD_LIBS = DDD_LIBS,

)
