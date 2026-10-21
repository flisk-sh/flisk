# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔐 INFISICAL SECRETS GENERATOR
# =============================================================================
# Generates secret injection configuration for services
# Replaces: Shell-based infisical-entrypoint.sh injection
# =============================================================================
#
# This module generates:
#   - Environment variable mappings for secret paths
#   - Docker Compose secret injection configuration
#   - Kubernetes secret references (future)
#   - Local development .env templates
#
# Usage:
#   load("./infisical/secrets_generator.star", "SecretsGenerator")
#   config = SecretsGenerator.generate_for_service("my-service", "/services/my-service")
# =============================================================================

def _get_timestamp():
    """Get current timestamp string"""
    return str(local("date +%Y-%m-%dT%H:%M:%S", quiet=True)).strip()

# =============================================================================
# Secret Path Configuration
# =============================================================================

DEFAULT_SECRET_KEYS = [
    "DATABASE_URL",
    "JWT_SECRET",
    "RESOURCE_API_KEY",
    "REDIS_URL",
    "NATS_URL",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "API_GATEWAY_TOKEN",
]

# Required secrets for each service type
RESOURCE_TYPE_SECRETS = {
    "backend": [
        "DATABASE_URL",
        "JWT_SECRET",
        "RESOURCE_API_KEY",
    ],
    "frontend": [
        "API_GATEWAY_TOKEN",
    ],
    "api-gateway": [
        "JWT_SECRET",
        "RESOURCE_API_KEY",
    ],
    "payment": [
        "DATABASE_URL",
        "JWT_SECRET",
        "RESOURCE_API_KEY",
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
    ],
    "notification": [
        "DATABASE_URL",
        "JWT_SECRET",
        "RESOURCE_API_KEY",
        "SMTP_PASSWORD",
        "SENDGRID_API_KEY",
    ],
}

# =============================================================================
# Secret Injection Patterns
# =============================================================================

def _generate_docker_compose_env(resource_name, secret_path, additional_vars=None):
    """
    Generate Docker Compose environment section for secret injection.
    
    Args:
        resource_name: Name of the service
        secret_path: Infisical path (e.g., /services/my-service)
        additional_vars: Additional environment variables dict
    
    Returns:
        Dictionary for docker-compose environment section
    """
    env = {
        # Core Infisical configuration
        "RESOURCE_NAME": resource_name,
        "INFISICAL_SECRET_PATH": secret_path,
        
        # Token injection (from host env or Infisical)
        "INFISICAL_TOKEN": "${INFISICAL_TOKEN:-}",
        "INFISICAL_CLIENT_ID": "${INFISICAL_CLIENT_ID:-}",
        "INFISICAL_CLIENT_SECRET": "${INFISICAL_CLIENT_SECRET:-}",
        
        # API configuration
        "INFISICAL_API_URL": "${INFISICAL_API_URL:-http://infisical:8080}",
        "INFISICAL_PROJECT_ID": "${INFISICAL_PROJECT_ID:-}",
        "INFISICAL_ENVIRONMENT": "${INFISICAL_ENVIRONMENT:-dev}",
        
        # Fallback policy: this generator only feeds local Tilt/docker-compose dev
        # environments (see topologies/platform/docker/compose/compose.star). There's
        # rarely a real Infisical server running locally, so default to allowing the
        # entrypoint to fall back to the plain env vars already in the compose file
        # instead of failing to start. Production/CI paths (Kubernetes secrets, etc.)
        # are generated separately and are unaffected by this default.
        "INFISICAL_ALLOW_FALLBACK": "${INFISICAL_ALLOW_FALLBACK:-true}",
    }
    
    if additional_vars:
        env.update(additional_vars)
    
    return env

def _generate_entrypoint_env(resource_name, secret_path, command):
    """
    Generate environment for entrypoint.sh-based secret injection.
    
    This is the zero-code pattern - entrypoint handles all secret fetching.
    
    Args:
        resource_name: Name of the service
        secret_path: Infisical path
        command: Command to run after secret injection
    
    Returns:
        Dict with entrypoint configuration
    """
    return {
        "RESOURCE_NAME": resource_name,
        "INFISICAL_SECRET_PATH": secret_path,
        "INFISICAL_TOKEN": "${INFISICAL_TOKEN:-}",
        "INFISICAL_CLIENT_ID": "${INFISICAL_CLIENT_ID:-}",
        "INFISICAL_CLIENT_SECRET": "${INFISICAL_CLIENT_SECRET:-}",
        "INFISICAL_API_URL": "${INFISICAL_API_URL:-http://infisical:8080}",
        "INFISICAL_PROJECT_ID": "${INFISICAL_PROJECT_ID:-}",
        "INFISICAL_ENVIRONMENT": "${INFISICAL_ENVIRONMENT:-dev}",
        "ENTRYPOINT_COMMAND": command,
        "INFISICAL_ALLOW_FALLBACK": "false",
    }

def _generate_kubernetes_secret_ref(resource_name, secret_path):
    """
    Generate Kubernetes secret reference configuration.
    
    Args:
        resource_name: Name of the service
        secret_path: Infisical path
    
    Returns:
        Dict with Kubernetes secret configuration
    """
    return {
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {
            "name": "{}-secrets".format(resource_name),
            "annotations": {
                "infisical.path": secret_path,
                "infisical.operator.kubernetes.io/auto-reload": "true",
            },
        },
        "type": "Opaque",
    }

# =============================================================================
# Local Development Configuration
# =============================================================================

def _generate_local_env_template(resource_name, secret_path, resource_type="backend"):
    """
    Generate .env file template for local development.
    
    Args:
        resource_name: Name of the service
        secret_path: Infisical path
        resource_type: Type of service for determining required secrets
    
    Returns:
        String content for .env file
    """
    required_secrets = RESOURCE_TYPE_SECRETS.get(resource_type, RESOURCE_TYPE_SECRETS["backend"])
    timestamp = _get_timestamp()
    
    lines = [
        "# Infisical Local Development Configuration",
        "# Service: {}".format(resource_name),
        "# Path: {}".format(secret_path),
        "# Generated: {}".format(timestamp),
        "#",
        "# ⚠️  SECURITY WARNING: Do not commit this file to Git!",
        "# This file should be in .gitignore",
        "",
        "# Infisical Connection",
        "INFISICAL_API_URL=http://localhost:8089",
        "INFISICAL_ENVIRONMENT=dev",
        "INFISICAL_SECRET_PATH={}".format(secret_path),
        "RESOURCE_NAME={}".format(resource_name),
        "",
        "# Authentication (Machine Identity)",
        "# Get these from Infisical Dashboard > Identities > machine1",
        "INFISICAL_CLIENT_ID=your-client-id-here",
        "INFISICAL_CLIENT_SECRET=your-client-secret-here",
        "INFISICAL_PROJECT_ID=your-project-id-here",
        "",
        "# Required Secrets (to be fetched from Infisical):",
    ]
    
    for secret in required_secrets:
        lines.append("# {}=__will_be_fetched_from_infisical__".format(secret))
    
    lines.extend([
        "",
        "# Tilt Integration (optional)",
        "# These are injected by Tilt during local development",
        "TILT_ENV=local",
        "TILT_HOST=localhost",
    ])
    
    return "\n".join(lines)

# =============================================================================
# Validation
# =============================================================================

def _validate_secret_path(secret_path):
    """
    Validate Infisical secret path format.
    
    Args:
        secret_path: Path to validate
    
    Returns:
        Tuple (is_valid, error_message)
    """
    if not secret_path:
        return False, "Secret path cannot be empty"
    
    if not secret_path.startswith("/"):
        return False, "Secret path must start with /"
    
    # Valid characters: alphanumeric, hyphen, underscore, forward slash
    valid_chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_/"
    invalid = []
    for i in range(len(secret_path)):
        c = secret_path[i]
        if c not in valid_chars:
            invalid.append(c)
    if len(invalid) > 0:
        return False, "Invalid characters in path: {}".format(invalid)
    
    # Path depth limit (Infisical limitation)
    parts = []
    for x in secret_path.split("/"):
        if x:
            parts.append(x)
    depth = len(parts)
    if depth > 20:
        return False, "Path depth exceeds maximum (20)"
    
    return True, ""

def _validate_resource_name(resource_name):
    """
    Validate service name format.
    
    Args:
        resource_name: Name to validate
    
    Returns:
        Tuple (is_valid, error_message)
    """
    if not resource_name:
        return False, "Service name cannot be empty"
    
    # Valid characters: alphanumeric, hyphen, underscore
    valid_chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"
    invalid = []
    for i in range(len(resource_name)):
        c = resource_name[i]
        if c not in valid_chars:
            invalid.append(c)
    if len(invalid) > 0:
        return False, "Invalid characters in service name: {}".format(invalid)
    
    if len(resource_name) > 64:
        return False, "Service name too long (max 64 characters)"
    
    return True, ""

# =============================================================================
# Main Generator Functions
# =============================================================================

def generate_for_service(resource_name, secret_path, resource_type="backend", command=None, additional_vars=None):
    """
    Generate complete secret injection configuration for a service.
    
    This is the main entry point for secret generation.
    
    Args:
        resource_name: Name of the service (e.g., "user-management-backend")
        secret_path: Infisical path (e.g., "/services/user")
        resource_type: Type of service (backend, frontend, api-gateway, payment, notification)
        command: Command to run after secret injection (for entrypoint pattern)
        additional_vars: Additional environment variables
    
    Returns:
        Dict with all secret configurations:
        {
            "resource_name": str,
            "secret_path": str,
            "resource_type": str,
            "validation": {"valid": bool, "errors": [str]},
            "docker_compose": {"environment": dict},
            "entrypoint": {"environment": dict},
            "kubernetes": {"secret_ref": dict},
            "local_template": str,
            "required_secrets": [str],
        }
    """
    # Validate inputs
    path_valid, path_error = _validate_secret_path(secret_path)
    name_valid, name_error = _validate_resource_name(resource_name)
    
    errors = []
    if not path_valid:
        errors.append(path_error)
    if not name_valid:
        errors.append(name_error)
    
    validation = {
        "valid": path_valid and name_valid,
        "errors": errors,
    }
    
    # Generate configurations
    docker_compose_env = _generate_docker_compose_env(resource_name, secret_path, additional_vars)
    
    entrypoint_env = None
    if command:
        entrypoint_env = _generate_entrypoint_env(resource_name, secret_path, command)
    
    k8s_secret = _generate_kubernetes_secret_ref(resource_name, secret_path)
    local_template = _generate_local_env_template(resource_name, secret_path, resource_type)
    required_secrets = RESOURCE_TYPE_SECRETS.get(resource_type, RESOURCE_TYPE_SECRETS["backend"])
    
    return {
        "resource_name": resource_name,
        "secret_path": secret_path,
        "resource_type": resource_type,
        "validation": validation,
        "docker_compose": {
            "environment": docker_compose_env,
        },
        "entrypoint": {
            "environment": entrypoint_env,
        } if entrypoint_env else None,
        "kubernetes": {
            "secret_ref": k8s_secret,
        },
        "local_template": local_template,
        "required_secrets": required_secrets,
    }

def generate_for_services_batch(services_config):
    """
    Generate secret configurations for multiple services.
    
    Args:
        services_config: List of dicts with keys:
            - name: Service name
            - path: Infisical path
            - type: Service type (optional, default "backend")
            - command: Entrypoint command (optional)
            - additional_vars: Additional env vars (optional)
    
    Returns:
        Dict mapping service names to their configurations
    """
    results = {}
    
    for config in services_config:
        name = config.get("name")
        path = config.get("path")
        svc_type = config.get("type", "backend")
        command = config.get("command")
        additional = config.get("additional_vars")
        
        if not name or not path:
            results[name or "unknown"] = {
                "validation": {"valid": False, "errors": ["Missing name or path"]},
            }
            continue
        
        results[name] = generate_for_service(name, path, svc_type, command, additional)
    
    return results

# =============================================================================
# Public API
# =============================================================================

SecretsGenerator = struct(
    # Main generator functions
    generate_for_service=generate_for_service,
    generate_for_services_batch=generate_for_services_batch,
    
    # Validation
    validate_secret_path=_validate_secret_path,
    validate_resource_name=_validate_resource_name,
    
    # Configuration constants
    DEFAULT_SECRET_KEYS=DEFAULT_SECRET_KEYS,
    RESOURCE_TYPE_SECRETS=RESOURCE_TYPE_SECRETS,
    
    # Individual generators (for advanced use)
    generate_docker_compose_env=_generate_docker_compose_env,
    generate_entrypoint_env=_generate_entrypoint_env,
    generate_kubernetes_secret_ref=_generate_kubernetes_secret_ref,
    generate_local_env_template=_generate_local_env_template,
)
