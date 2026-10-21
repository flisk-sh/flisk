#!/usr/bin/env starlark
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🐳 TILT SDK - TRAEFIK CONSTANTS
# =============================================================================
# STORY 4 FIX: API Gateway 504 Error Prevention
# - Startup grace period: 30s (allows services to fully initialize)
# - Extended timeouts for cold-start services
# - Proper health check sequencing
# =============================================================================

# === INLINED CONSTANTS for pure extension loading ===
TRAEFIK_CONFIG = {
    "entrypoint": "web",
    "web_entrypoint": "web",
    "network": "traefik-public",
    "default_host": "localhost",
    "default_port": 8080,
    "tls_enabled": False,
    "entrypoints": ["web"],
    "middlewares": [],
    "tls": {"enabled": False},
    "healthcheck_path": "/health",
    "healthcheck_interval": "10s",
    "healthcheck_timeout": "5s",
    "frontend_priority_base": 100,
    "websecure_entrypoint": "websecure",
    "enable_strip_prefix": True,
    "localhost_suffix": ".localhost",
    "healthcheck_retries": 3,
    "resource_startup_delay": "30s",
    "startup_grace_period": "30s",
    "response_timeout": "30s",
    "connection_timeout": "10s",
    "retry_attempts": 3,
    "circuit_breaker_threshold": 5,
    "strip_prefix_middleware_suffix": "-strip-prefix",
    "retry_initial_interval": "1s",
    "retry_max_interval": "10s",
    "rate_limit_requests": 100,
    "rate_limit_period": "1m",
    "buffer_request_body": True,
    "forward_auth_url": "",
    "api_base_path": "/api",
    "api_version": "v1"
}
DEFAULTS = {}

# === END INLINED CONSTANTS ===


load("../constants.star", "PlatformDockerConstants")
# =============================================================================
# MASTER CONFIG IMPORTS - Use centralized configuration
# =============================================================================


# =============================================================================
# API PATH CONSTANTS - Import for dynamic API path generation
# =============================================================================
load("./api_path_constants.star",
     "get_api_path_for_domain",
     "get_api_path_for_service",
     "build_traefik_url",
     "build_health_endpoint")

TRAEFIK_ENABLE_LABEL = "traefik.enable=true"
TRAEFIK_DOCKER_NETWORK = PlatformDockerConstants.NETWORK_TRAEFIK_PUBLIC

# Entrypoints from master config
TRAEFIK_WEBSECURE_ENTRYPOINT = TRAEFIK_CONFIG["websecure_entrypoint"]

TRAEFIK_FRONTEND_ENABLE_HTTP = True
TRAEFIK_FRONTEND_ENABLE_HTTPS = True
TRAEFIK_BACKEND_ENABLE_HTTP = True
TRAEFIK_BACKEND_ENABLE_HTTPS = False

# Middleware settings from master config
TRAEFIK_ENABLE_STRIP_PREFIX_MIDDLEWARE = TRAEFIK_CONFIG["enable_strip_prefix"]
TRAEFIK_ENABLE_FRONTEND_HOST_RULE = True
TRAEFIK_ENABLE_FRONTEND_PATH_RULE = True
TRAEFIK_ENABLE_BACKEND_HOST_RULE = True
TRAEFIK_ENABLE_BACKEND_PATH_RULE = True

TRAEFIK_PROJECT_HOST = PlatformDockerConstants.LOCAL_DOMAIN
TRAEFIK_PROJECT_APP_HOST = PlatformDockerConstants.APP_LOCAL_DOMAIN
TRAEFIK_PROJECT_API_HOST = PlatformDockerConstants.API_LOCAL_DOMAIN
TRAEFIK_FRONTEND_LOCALHOST_SUFFIX = TRAEFIK_CONFIG["localhost_suffix"]

# Priority from master config
TRAEFIK_FRONTEND_PRIORITY_BASE = TRAEFIK_CONFIG["frontend_priority_base"]

# =============================================================================
# STORY 4 FIX: Health check configuration with 30-second grace period
# =============================================================================
# From TILT_RESOURCE_DEFAULTS.star - centralized configuration
# Health check configuration - optimized to prevent 504s on startup
TRAEFIK_HEALTHCHECK_RETRIES = TRAEFIK_CONFIG["healthcheck_retries"]

# STORY 4 FIX: 30-second grace period (matches issue requirement)
TRAEFIK_RESOURCE_STARTUP_DELAY = TRAEFIK_CONFIG["resource_startup_delay"]
TRAEFIK_HEALTHY_THRESHOLD = TRAEFIK_CONFIG["retry_attempts"]
TRAEFIK_MIDDLEWARE_SUFFIX = TRAEFIK_CONFIG["strip_prefix_middleware_suffix"]

# =============================================================================
# API ROUTING PATHS - Dynamic from Manifests
# =============================================================================
# API paths are generated dynamically from manifest domain and appName fields
# No hardcoded service names - all from service.json
# =============================================================================

# Planner service paths are generated dynamically from manifests
# Use get_api_path_for_domain() function instead of hardcoded constants

# API paths are now generated dynamically - no hardcoded constants
# Use get_api_path_for_domain() function instead

# =============================================================================
# API ROUTING PATTERN
# =============================================================================
# Standard API path pattern generated from manifest: /api/v1/{appName}
# Domain comes from service manifest, allowing dynamic service discovery
# No hardcoded examples - all paths from service.json
# =============================================================================
# TRAEFIK_API_VERSION and TRAEFIK_API_BASE_PATH now imported from master config

# =============================================================================
# STORY 4 FIX: Retry middleware configuration for transient failures
# =============================================================================
TRAEFIK_RETRY_ATTEMPTS = TRAEFIK_CONFIG["retry_attempts"]
TRAEFIK_RETRY_INITIAL_INTERVAL = TRAEFIK_CONFIG["retry_initial_interval"]

# =============================================================================
# MASTER CONFIG RE-EXPORTS
# =============================================================================
# Re-export all values imported from master config so other files can load them
# from this module. This maintains backward compatibility.

# Define traefik constants from master config (available for other files to load)
TRAEFIK_WEB_ENTRYPOINT = TRAEFIK_CONFIG["web_entrypoint"]
TRAEFIK_WEBSECURE_ENTRYPOINT = TRAEFIK_CONFIG["websecure_entrypoint"]
TRAEFIK_HEALTHCHECK_INTERVAL = TRAEFIK_CONFIG["healthcheck_interval"]
TRAEFIK_HEALTHCHECK_TIMEOUT = TRAEFIK_CONFIG["healthcheck_timeout"]
TRAEFIK_HEALTHCHECK_RETRIES = TRAEFIK_CONFIG["healthcheck_retries"]
TRAEFIK_STARTUP_GRACE_PERIOD = TRAEFIK_CONFIG["startup_grace_period"]
TRAEFIK_API_BASE_PATH = TRAEFIK_CONFIG["api_base_path"]
TRAEFIK_API_VERSION = TRAEFIK_CONFIG["api_version"]
