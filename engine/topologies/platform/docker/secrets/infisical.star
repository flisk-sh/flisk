# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔐 LOCAL ENVIRONMENT GENERATOR
# =============================================================================
# Free-tier service env injection. Premium overlays may replace this module with
# Infisical-backed secret injection.
# =============================================================================
#
# This module provides:
#   - Environment variable generation for docker-compose/.env injection
#   - No external secret manager required in the public/free engine
#
# Usage:
#   load("../secrets/infisical.star", "InfisicalEnv")
#   env_vars = InfisicalEnv.get_for_service("my-service")
# =============================================================================

load("../constants.star", "PlatformDockerConstants")

def _get_infisical_base_url():
    """Get the Infisical base URL."""
    return "http://{}-infisical:8080".format(PlatformDockerConstants.PROJECT_NAME)

def get_infisical_environment_vars(as_array=True, resource_name=None, resource_type="backend"):
    """
    Generate environment variables for local Compose/.env injection.

    Kept under the historical function name so existing Starlark callers do not
    break. The free engine intentionally avoids Infisical credentials; premium
    overlays can replace this implementation with a real secret-provider bridge.
    
    Args:
        as_array: If True, return as YAML array format; else as dict format
        resource_name: Optional service name for service-specific configuration
        resource_type: Service type for path generation
    
    Returns:
        String with environment variables in YAML format
    """
    env = {
        "TDK_SECRET_PROVIDER": "${TDK_SECRET_PROVIDER:-env-file}",
        "TDK_ENV": "${TILT_ENV:-development}",
    }

    if resource_name:
        env["TDK_RESOURCE_NAME"] = resource_name
        env["TDK_RESOURCE_TYPE"] = resource_type
    
    if as_array:
        lines = []
        for key, value in env.items():
            lines.append("      - {}={}".format(key, value))
        return "\n".join(lines)
    else:
        lines = []
        for key, value in env.items():
            lines.append("      {}: {}".format(key, value))
        return "\n".join(lines)

def get_for_service(resource_name, resource_type="backend", as_array=True):
    """
    Get Infisical environment variables for a specific service.
    
    Args:
        resource_name: Name of the service
        resource_type: Type of service
        as_array: Return format (array or dict style)
    
    Returns:
        String with environment variables
    """
    return get_infisical_environment_vars(
        as_array=as_array,
        resource_name=resource_name,
        resource_type=resource_type,
    )

def get_batch_for_services(resource_configs):
    """
    Get Infisical environment variables for multiple services.
    
    Args:
        resource_configs: List of dicts with 'name' and optional 'type'
    
    Returns:
        Dict mapping service names to environment variable strings
    """
    results = {}
    
    for config in resource_configs:
        name = config.get("name")
        svc_type = config.get("type", "backend")
        
        if name:
            results[name] = get_for_service(name, svc_type)
    
    return results

# =============================================================================
# Public API
# =============================================================================

InfisicalEnv = struct(
    get_base_url=_get_infisical_base_url,
    get_infisical_environment_vars=get_infisical_environment_vars,
    get_for_service=get_for_service,
    get_batch_for_services=get_batch_for_services,
)
