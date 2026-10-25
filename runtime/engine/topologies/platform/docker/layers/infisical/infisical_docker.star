# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔐 INFISICAL DOCKER INTEGRATION
# =============================================================================
# Replaces: Hardcoded infisical-entrypoint.sh references in Dockerfile generation
# Uses: Starlark generators for secret configuration
# =============================================================================
#
# This module provides:
#   - Dockerfile generation for Infisical secret injection
#   - Environment variable configuration using Starlark generators
#   - Entrypoint setup with proper secret paths
#
# Usage:
#   load("./infisical_docker.star", "InfisicalDocker")
#   dockerfile_snippet = InfisicalDocker.runtime_setup("my-service", "/services/my-service")
# =============================================================================

# Load the generators
load("../../../../tilt/generators/infisical/secrets_generator.star", _Secrets="SecretsGenerator")
load("../../../../tilt/generators/infisical/path_manager.star", _Paths="PathManager")

# =============================================================================
# Constants
# =============================================================================

ENTRYPOINT_PATH = "/entrypoint.sh"
ENTRYPOINT_SOURCE = "shared-platform-engineering/docker-templates/infisical-entrypoint.sh"

# =============================================================================
# Runtime Secret Injection (L4 Runtime Layers)
# =============================================================================

def _runtime_setup(resource_name, secret_path=None, resource_type="backend", command="bun run start", use_entrypoint=True):
    """
    Generate Dockerfile snippet for Infisical runtime setup.
    
    Args:
        resource_name: Name of the service
        secret_path: Infisical path (default: auto-generated from resource_name)
        resource_type: Type of service (backend, frontend, worker, etc.)
        command: Command to run after secret injection
        use_entrypoint: Whether to use entrypoint.sh (default: True)
    
    Returns:
        String with Dockerfile commands for runtime setup
    """
    # Auto-generate secret path if not provided
    if not secret_path:
        path_plan = _Paths.plan_resource_path(resource_name, resource_type)
        secret_path = path_plan["full_path"]
    
    # Generate configuration using the Starlark generator
    config = _Secrets.generate_for_service(
        resource_name=resource_name,
        secret_path=secret_path,
        resource_type=resource_type,
        command=command,
    )
    
    # Extract environment variables from the config
    env_vars = config["docker_compose"]["environment"]
    
    parts = []
    
    if use_entrypoint:
        # Copy entrypoint script
        parts.append("COPY --chmod=0755 {} {}\n".format(ENTRYPOINT_SOURCE, ENTRYPOINT_PATH))
        
        # Set environment variables
        for key, value in env_vars.items():
            # Handle env var references properly
            if value.startswith("${") and value.endswith("}"):
                parts.append("ENV {}={}\n".format(key, value))
            else:
                parts.append("ENV {}=\"{}\"\n".format(key, value))
        
        # Set RESOURCE_NAME explicitly
        parts.append("ENV RESOURCE_NAME={}\n".format(resource_name))
        
        # Set entrypoint
        parts.append("ENTRYPOINT [\"{}\"]\n".format(ENTRYPOINT_PATH))
        
        # Set command
        cmd_parts = command.split()
        cmd_json = ", ".join(["\"{}\"".format(p) for p in cmd_parts])
        parts.append("CMD [{}]\n".format(cmd_json))
    else:
        # Without entrypoint, just set env vars and use direct command
        for key, value in env_vars.items():
            parts.append("ENV {}={}\n".format(key, value))
        parts.append("CMD [\"{}\"]\n".format(command))
    
    return "".join(parts)

def _runtime_setup_simple(resource_name, use_entrypoint=True):
    """
    Simple runtime setup using known service configuration.
    
    Args:
        resource_name: Name of the service
        use_entrypoint: Whether to use entrypoint.sh
    
    Returns:
        String with Dockerfile commands
    """
    # Try to get known path
    secret_path = _Paths.get_known_resource_path(resource_name)
    
    if not secret_path:
        # Plan a new path
        path_plan = _Paths.plan_resource_path(resource_name)
        secret_path = path_plan["full_path"]
    
    return _runtime_setup(
        resource_name=resource_name,
        secret_path=secret_path,
        use_entrypoint=use_entrypoint,
    )

# =============================================================================
# Builder Secret Injection (L3 Builder Layers)
# =============================================================================

def _builder_setup(use_infisical=True, use_golden=True):
    """
    Generate Dockerfile snippet for builder Infisical CLI setup.
    
    Args:
        use_infisical: Whether to include Infisical CLI setup
        use_golden: Whether using golden image (skips CLI install)
    
    Returns:
        String with Dockerfile commands for builder setup
    """
    if not use_infisical or use_golden:
        return ""
    
    # Only install Infisical CLI if not skipped AND not using golden image
    return (
        "# Conditionally install Infisical CLI only if not skipped\n"
        + "RUN if [ \"$SKIP_INFISICAL_SETUP\" != \"1\" ]; then \\\n"
        + "        echo \"\u26a0\ufe0f Installing Infisical CLI...\" && \\\n"
        + "        apk add --no-cache bash curl netcat-openbsd && \\\n"
        + "        curl -sL https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh | bash && \\\n"
        + "        apk add --no-cache infisical; \\\n"
        + "    else \\\n"
        + "        echo \"\u2705 Skipping Infisical CLI installation (SKIP_INFISICAL_SETUP=1)\"; \\\n"
        + "    fi\n"
        + "COPY --chmod=0755 {} {}\n".format(ENTRYPOINT_SOURCE, ENTRYPOINT_PATH)
    )

# =============================================================================
# Environment Variable Generation (for docker-compose)
# =============================================================================

def _generate_compose_env(resource_name, secret_path=None, resource_type="backend", additional_vars=None):
    """
    Generate environment variables for docker-compose.
    
    Args:
        resource_name: Name of the service
        secret_path: Infisical path
        resource_type: Type of service
        additional_vars: Additional environment variables
    
    Returns:
        Dict of environment variables for docker-compose
    """
    if not secret_path:
        secret_path = _Paths.get_known_resource_path(resource_name)
        if not secret_path:
            path_plan = _Paths.plan_resource_path(resource_name, resource_type)
            secret_path = path_plan["full_path"]
    
    config = _Secrets.generate_for_service(
        resource_name=resource_name,
        secret_path=secret_path,
        resource_type=resource_type,
    )
    
    env = config["docker_compose"]["environment"]
    
    if additional_vars:
        env.update(additional_vars)
    
    return env

# =============================================================================
# Secret Path Resolution (for Prisma/migrators)
# =============================================================================

def _resolve_secret_path(resource_name, default_subpath="/database"):
    """
    Resolve the secret path for database operations.
    
    Args:
        resource_name: Name of the service
        default_subpath: Default subpath for database secrets
    
    Returns:
        String with the full secret path
    """
    base_path = _Paths.get_known_resource_path(resource_name)
    
    if not base_path:
        path_plan = _Paths.plan_resource_path(resource_name)
        base_path = path_plan["full_path"]
    
    return "{}{}".format(base_path, default_subpath)

def _generate_migrator_env(resource_name, db_name=None):
    """
    Generate environment variables for database migrator.
    
    Args:
        resource_name: Name of the service
        db_name: Database name (optional)
    
    Returns:
        Dict of environment variables
    """
    secret_path = _resolve_secret_path(resource_name)
    
    env = {
        "RESOURCE_NAME": resource_name,
        "INFISICAL_SECRET_PATH": secret_path,
        "INFISICAL_TOKEN": "${INFISICAL_TOKEN:-}",
        "INFISICAL_CLIENT_ID": "${INFISICAL_CLIENT_ID:-}",
        "INFISICAL_CLIENT_SECRET": "${INFISICAL_CLIENT_SECRET:-}",
        "INFISICAL_API_URL": "${INFISICAL_API_URL:-http://infisical:8080}",
        "INFISICAL_PROJECT_ID": "${INFISICAL_PROJECT_ID:-}",
        "INFISICAL_ENVIRONMENT": "${INFISICAL_ENVIRONMENT:-dev}",
    }
    
    if db_name:
        env["DATABASE_NAME"] = db_name
    
    return env

# =============================================================================
# Main Public API
# =============================================================================

InfisicalDocker = struct(
    # Runtime setup (L4 layers)
    runtime_setup=_runtime_setup,
    runtime_setup_simple=_runtime_setup_simple,
    
    # Builder setup (L3 layers)
    builder_setup=_builder_setup,
    
    # Environment generation
    generate_compose_env=_generate_compose_env,
    generate_migrator_env=_generate_migrator_env,
    
    # Path resolution
    resolve_secret_path=_resolve_secret_path,
    
    # Constants
    ENTRYPOINT_PATH=ENTRYPOINT_PATH,
    ENTRYPOINT_SOURCE=ENTRYPOINT_SOURCE,
)
