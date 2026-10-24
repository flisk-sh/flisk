# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔗 TILT SDK - DEPENDENCY RESOLUTION MODULE
# =============================================================================
# Purpose: Centralized dependency resolution for generators
#          Auto-discover and inject configuration from internal dependencies
# =============================================================================

load("./resolver.star", 
    "resolve_backend_api_path",
    "resolve_dependency_api_urls", 
    "get_backend_manifest",
    "inject_dependency_env_vars",
    "DependencyResolvers",
)

# Re-export all functions for easy access
resolve_backend_api_path = resolve_backend_api_path
resolve_dependency_api_urls = resolve_dependency_api_urls
get_backend_manifest = get_backend_manifest
inject_dependency_env_vars = inject_dependency_env_vars
DependencyResolvers = DependencyResolvers
