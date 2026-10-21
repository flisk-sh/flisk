#!/usr/bin/env starlark
# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔍 TILT DISCOVERY CONFIGURATION - MASTER CONFIG
# =============================================================================
#
# ⚠️  DEVELOPER NOTICE: This is a SYSTEM CONFIG file.
#    For human-friendly docs, see: TILT_CONFIG.md
#
# This file defines service discovery settings for the Flisk platform.
# Discovery automatically finds and registers services from the filesystem.
#
# 📖 TO EDIT DISCOVERY SETTINGS:
#   Edit: TILT_DISCOVERY.star (this file) for platform-wide discovery behavior
#
# 🔗 ARCHITECTURE:
#   - TILT_TECH_STACK.star: Technology choices
#   - TILT_RESOURCE_DEFAULTS.star: Service defaults (ports, health checks)
#   - TILT_DISCOVERY.star: Discovery-specific settings (scan intervals, synthesis)
#   - spec.master: Project-specific service lists
#
# =============================================================================

# =============================================================================
# DISCOVERY SCAN CONFIGURATION
# =============================================================================
# How and when the discovery daemon scans for services.


def get_discovery_scan_config():
    """Return discovery scan configuration.

    Returns:
        dict: Scan behavior settings
    """
    return {
        # Filesystem scan interval in seconds (for auto-discovery daemon)
        "scan_interval_seconds": 5,

        # Maximum scan timeout in milliseconds
        "max_scan_timeout_ms": 5000,

        # Initial scan delay on startup (allows services to stabilize)
        "initial_scan_delay_seconds": 2,

        # Debounce delay for filesystem changes (prevents excessive rescans)
        "scan_debounce_ms": 100,
    }


# =============================================================================
# MANIFEST DISCOVERY CONFIGURATION
# =============================================================================
# Settings for manifest file discovery and synthesis.


def get_manifest_discovery_config():
    """Return manifest discovery configuration.

    Returns:
        dict: Manifest discovery settings
    """
    return {
        # Maximum manifests per root before warning
        "max_manifests_per_root": 50,

        # Maximum manifest file size in bytes (1MB)
        "max_manifest_size_bytes": 1048576,

        # Manifest filename patterns to search for
        "manifest_filenames": [
            "service.json",
        ],

        # Enable synthesis for services without manifests
        "synthesis_enabled": True,

        # Synthesis port defaults by service type
        "synthesis_port_defaults": {
            "frontend": 3000,
            "backend": 4000,
            "sdk": 5175,
            "migrator": 4000,
            "worker": 4000,
            "library": None,  # Libraries don't have ports
        },

        # Service type detection patterns (suffixes)
        "resource_type_patterns": {
            "frontend": "-frontend",
            "backend": "-backend",
            "sdk": "-sdk",
            "migrator": "-migrator",
            "worker": "-worker",
            "library": "-library",
        },
    }


# =============================================================================
# SERVICE SYNTHESIS CONFIGURATION
# =============================================================================
# Auto-compute settings for manifest synthesis.


def get_synthesis_config():
    """Return resource synthesis configuration.

    Returns:
        dict: Auto-compute settings for synthesized manifests
    """
    return {
        # Enable auto-computation of ports from service type + domain
        "auto_compute_ports": True,

        # Enable auto-computation of Traefik paths from domain
        "auto_compute_traefik": True,

        # Enable auto-computation of database names from domain + service
        "auto_compute_database_name": True,

        # Enable auto-computation of backendName for frontends
        "auto_compute_backend_name": True,

        # Enable auto-computation of basePath for frontends
        "auto_compute_base_path": True,

        # Database naming pattern: {project}_{domain}_{resource_function}
        # Example: services/product/users/user-management-backend -> {project}_user_management
        "database_name_pattern": "TDK_{domain}_{function}",

        # Backend name pattern for frontends: {domain}-management-backend
        "backend_name_pattern": "{domain}-management-backend",

        # Base path pattern for frontends: /{domain}s
        "base_path_pattern": "/{domain}s",

        # Traefik path prefix pattern for backends: /api/{domain}s
        "traefik_path_pattern": "/api/{domain}s",
    }


# =============================================================================
# DOMAIN CONFIGURATION
# =============================================================================
# Business stacks are defined in .tdk/project.json per project.
# This function returns an empty list - stacks are discovered dynamically.


def get_valid_stacks():
    """Return list of valid business stacks from project config.

    Returns:
        list: Valid stack names (loaded from .tdk/project.json)
    """
    # Stacks are project-specific and loaded from project.json
    # Return empty list - actual stacks discovered from filesystem
    return []


# =============================================================================
# SERVICE TYPE CONFIGURATION
# =============================================================================
# Valid service types for the platform.


def get_valid_resource_types():
    """Return list of valid resource types.

    Returns:
        list: Valid resource type names
    """
    return [
        "frontend",
        "backend",
        "library",
        "migrator",
        "sdk",
        "worker",
    ]


# =============================================================================
# RESOURCE-LEVEL FEATURES CONFIGURATION
# =============================================================================
# Valid values for a single resource's `features: []` array in its
# service.json (code generators plus per-resource infra capabilities).
# Distinct from project-level features (cli/src/utils/project-features.ts),
# which are infra/optional services enabled project-wide via project.json.


def get_valid_resource_features():
    """Return list of valid resource-level feature flags.

    Returns:
        list: Valid feature flag names for a resource's `features: []` array
    """
    return [
        # Resource-level features (code generators)
        "api-client",
        "env-config",
        "api-index",
        "prisma",
        # Infrastructure features
        "nats",
        "redis",
        "infisical",
        "vitest",
        "traefik",
        "websocket",
        "graphql",
        "grpc",
        "vite-node",
        "maintenance",
        # Premium (requires TDK_LICENSE_KEY) - see generate_backend_path_aliases()
        # in engine/topologies/tilt/generators/vite/helpers.star
        "ddd",
    ]


# =============================================================================
# PORT CONFIGURATION
# =============================================================================
# Port range definitions for validation.


def get_port_ranges():
    """Return port ranges by resource type.

    Returns:
        dict: Port range definitions
    """
    return {
        "frontend": {"min": 3000, "max": 5999},
        "backend": {"min": 4000, "max": 5999},
        "worker": {"min": 4000, "max": 6999},
        "migrator": {"min": 7000, "max": 7999},
        "sdk": {"min": 3000, "max": 9999},  # SDKs don't have strict rules
        "library": {"min": 3000, "max": 9999},  # Libraries don't have ports
    }


# =============================================================================
# DEPENDENCY RESOLUTION CONFIGURATION
# =============================================================================
# Settings for resolving service dependencies.


def get_dependency_resolution_config():
    """Return dependency resolution configuration.

    Returns:
        dict: Dependency resolution settings
    """
    return {
        # Maximum number of dependencies per service
        "max_dependencies": 10,

        # Maximum depth for dependency graph traversal
        "max_dependency_depth": 5,

        # Enable circular dependency detection
        "detect_circular_dependencies": True,

        # Library dependency patterns (package.json prefixes)
        "library_dependency_prefixes": [
            "@flisk/",
        ],

        # Default internal dependencies for service types
        "default_dependencies": {
            "backend": [],  # No default deps, explicit only
            "frontend": [],  # Backend deps computed from backendName
            "migrator": [],
            "worker": ["nats"],
        },
    }


# =============================================================================
# DISCOVERY PATHS CONFIGURATION
# =============================================================================
# Where to search for services.


def get_discovery_paths():
    """Return paths to scan for resources.

    Returns:
        list: Directory paths to scan
    """
    return [
        "services/product",
        "services/platform",
        "shared-product-engineering",
        "shared-platform-engineering",
        "shared-ddd-layers",
    ]


# =============================================================================
# COMPLETE DISCOVERY CONFIGURATION
# =============================================================================


def get_discovery_defaults():
    """Return complete discovery configuration.

    Returns:
        dict: All discovery settings
    """
    return {
        "scan": get_discovery_scan_config(),
        "manifest": get_manifest_discovery_config(),
        "synthesis": get_synthesis_config(),
        "stacks": get_valid_stacks(),
        "resource_types": get_valid_resource_types(),
        "features": get_valid_resource_features(),
        "port_ranges": get_port_ranges(),
        "dependencies": get_dependency_resolution_config(),
        "paths": get_discovery_paths(),
    }


# =============================================================================
# FEATURE FLAGS CONFIGURATION
# =============================================================================
# Feature flags for gradual rollout of new functionality.


def get_feature_flags():
    """Return feature flags for gradual rollout.

    These flags control the activation of new infrastructure features,
    allowing for safe, gradual rollout across the platform.

    Returns:
        dict: Feature flag states
    """
    return {
        # Enable new auto-computation defaults (ports, database names, etc.)
        "auto_compute_defaults": True,

        # Enable override detection and warnings
        "override_detection": True,

        # Enable synthesis-by-default for new services
        "synthesis_by_default": True,

        # Enable hardcoded value detection in validation
        "hardcoded_value_detection": True,

        # Enable CLI auto-fix capabilities
        "cli_auto_fix": True,

        # Enable strict validation mode (treats warnings as errors)
        "strict_validation": False,

        # Enable new port allocation strategy
        "new_port_allocation": True,

        # Enable master config validation
        "master_config_validation": True,

        # Migration mode - enables transitional compatibility
        "migration_mode": False,

        # Rollback plan available
        "rollback_enabled": True,
    }


# =============================================================================
# MODULE EXPORTS
# =============================================================================

# Configuration exports
DISCOVERY_SCAN_CONFIG = get_discovery_scan_config()
MANIFEST_DISCOVERY_CONFIG = get_manifest_discovery_config()
SYNTHESIS_CONFIG = get_synthesis_config()
VALID_STACKS = get_valid_stacks()
VALID_RESOURCE_TYPES = get_valid_resource_types()
VALID_RESOURCE_FEATURES = get_valid_resource_features()
PORT_RANGES = get_port_ranges()
DEPENDENCY_CONFIG = get_dependency_resolution_config()
DISCOVERY_PATHS = get_discovery_paths()
DISCOVERY_DEFAULTS = get_discovery_defaults()
FEATURE_FLAGS = get_feature_flags()

# Individual constants for convenience
MAX_MANIFESTS_PER_ROOT = MANIFEST_DISCOVERY_CONFIG["max_manifests_per_root"]
SCAN_INTERVAL_SECONDS = DISCOVERY_SCAN_CONFIG["scan_interval_seconds"]
MAX_SCAN_TIMEOUT_MS = DISCOVERY_SCAN_CONFIG["max_scan_timeout_ms"]
SYNTHESIS_ENABLED = MANIFEST_DISCOVERY_CONFIG["synthesis_enabled"]
MAX_DEPENDENCIES = DEPENDENCY_CONFIG["max_dependencies"]

__all__ = [
    # Functions
    "get_discovery_scan_config",
    "get_manifest_discovery_config",
    "get_synthesis_config",
    "get_valid_stacks",
    "get_valid_resource_types",
    "get_valid_resource_features",
    "get_port_ranges",
    "get_dependency_resolution_config",
    "get_discovery_paths",
    "get_discovery_defaults",
    "get_feature_flags",

    # Constants
    "DISCOVERY_SCAN_CONFIG",
    "MANIFEST_DISCOVERY_CONFIG",
    "SYNTHESIS_CONFIG",
    "VALID_STACKS",
    "VALID_RESOURCE_TYPES",
    "VALID_RESOURCE_FEATURES",
    "PORT_RANGES",
    "DEPENDENCY_CONFIG",
    "DISCOVERY_PATHS",
    "DISCOVERY_DEFAULTS",
    "FEATURE_FLAGS",
    "MAX_MANIFESTS_PER_ROOT",
    "SCAN_INTERVAL_SECONDS",
    "MAX_SCAN_TIMEOUT_MS",
    "SYNTHESIS_ENABLED",
    "MAX_DEPENDENCIES",
]
