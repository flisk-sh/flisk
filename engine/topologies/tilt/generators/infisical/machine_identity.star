# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🤖 INFISICAL MACHINE IDENTITY MANAGER
# =============================================================================
# Manages Infisical Machine Identity configuration and authentication
# Replaces: Shell scripts for machine identity setup
# =============================================================================
#
# This module provides:
#   - Machine Identity configuration generation
#   - Authentication method definitions (Universal Auth, OIDC, etc.)
#   - Client ID/Secret management patterns
#   - Token lifecycle management
#
# Usage:
#   load("./infisical/machine_identity.star", "MachineIdentity")
#   config = MachineIdentity.generate_universal_auth("my-machine", "/services/user")
# =============================================================================

def _get_timestamp():
    """Get current timestamp string"""
    return str(local("date +%Y-%m-%dT%H:%M:%S", quiet=True)).strip()

# =============================================================================
# Machine Identity Types
# =============================================================================

AUTH_METHODS = {
    "universal-auth": {
        "name": "Universal Auth",
        "description": "Client ID and Client Secret authentication",
        "env_vars": ["INFISICAL_CLIENT_ID", "INFISICAL_CLIENT_SECRET"],
        "supported": True,
        "recommended": True,
    },
    "oidc-auth": {
        "name": "OIDC Auth",
        "description": "OpenID Connect authentication for cloud providers",
        "env_vars": ["INFISICAL_OIDC_TOKEN"],
        "supported": True,
        "recommended": False,
    },
    "token-auth": {
        "name": "Token Auth",
        "description": "Service Token authentication (legacy)",
        "env_vars": ["INFISICAL_TOKEN"],
        "supported": True,
        "recommended": False,
        "deprecated": True,
    },
    "kubernetes-auth": {
        "name": "Kubernetes Auth",
        "description": "Kubernetes service account authentication",
        "env_vars": ["INFISICAL_KUBERNETES_TOKEN"],
        "supported": False,
        "recommended": False,
    },
    "aws-auth": {
        "name": "AWS IAM Auth",
        "description": "AWS IAM role authentication",
        "env_vars": ["AWS_ROLE_ARN", "AWS_WEB_IDENTITY_TOKEN_FILE"],
        "supported": False,
        "recommended": False,
    },
}

# =============================================================================
# Default Configuration
# =============================================================================

DEFAULT_MACHINE_CONFIG = {
    "auth_method": "universal-auth",
    "token_ttl_seconds": 3600,  # 1 hour
    "max_uses": 0,  # Unlimited
    "access_level": "service",  # service, project, organization
}

# =============================================================================
# Universal Auth Configuration
# =============================================================================

def _generate_universal_auth_config(identity_name, access_paths=None, project_id=None, environment="dev"):
    """
    Generate Universal Auth (Client ID + Client Secret) configuration.
    
    This is the recommended authentication method for services.
    
    Args:
        identity_name: Name of the machine identity (e.g., "machine1")
        access_paths: List of Infisical paths this identity can access
        project_id: Project ID for access
        environment: Environment (dev, staging, prod)
    
    Returns:
        Dict with Universal Auth configuration
    """
    if not access_paths:
        access_paths = ["/services/*"]
    
    # Normalize paths
    normalized_paths = []
    for path in access_paths:
        if not path.startswith("/"):
            path = "/" + path
        normalized_paths.append(path)
    
    return {
        "identity_name": identity_name,
        "auth_method": "universal-auth",
        "method_info": AUTH_METHODS["universal-auth"],
        "environment_variables": {
            "INFISICAL_CLIENT_ID": "${INFISICAL_CLIENT_ID}",
            "INFISICAL_CLIENT_SECRET": "${INFISICAL_CLIENT_SECRET}",
        },
        "config": {
            "project_id": project_id or "${INFISICAL_PROJECT_ID}",
            "environment": environment,
            "access_paths": normalized_paths,
            "token_ttl_seconds": DEFAULT_MACHINE_CONFIG["token_ttl_seconds"],
            "max_uses": DEFAULT_MACHINE_CONFIG["max_uses"],
        },
        "cli_command": "infisical login --method universal-auth --client-id <id> --client-secret <secret>",
        "docker_compose": {
            "INFISICAL_CLIENT_ID": "${INFISICAL_CLIENT_ID}",
            "INFISICAL_CLIENT_SECRET": "${INFISICAL_CLIENT_SECRET}",
            "INFISICAL_PROJECT_ID": project_id or "${INFISICAL_PROJECT_ID}",
            "INFISICAL_ENVIRONMENT": environment,
        },
    }

def _generate_oidc_auth_config(identity_name, oidc_issuer=None, allowed_audiences=None):
    """
    Generate OIDC Auth configuration.
    
    For cloud provider authentication (AWS, GCP, Azure).
    
    Args:
        identity_name: Name of the machine identity
        oidc_issuer: OIDC issuer URL
        allowed_audiences: List of allowed audience claims
    
    Returns:
        Dict with OIDC Auth configuration
    """
    return {
        "identity_name": identity_name,
        "auth_method": "oidc-auth",
        "method_info": AUTH_METHODS["oidc-auth"],
        "environment_variables": {
            "INFISICAL_OIDC_TOKEN": "${INFISICAL_OIDC_TOKEN}",
        },
        "config": {
            "oidc_issuer": oidc_issuer or "${OIDC_ISSUER}",
            "allowed_audiences": allowed_audiences or [],
        },
        "cli_command": "infisical login --method oidc-auth --oidc-token <token>",
        "docker_compose": {
            "INFISICAL_OIDC_TOKEN": "${INFISICAL_OIDC_TOKEN}",
        },
    }

def _generate_token_auth_config(identity_name, token=None):
    """
    Generate Token Auth configuration (legacy).
    
    Args:
        identity_name: Name of the machine identity
        token: Service token (or env var reference)
    
    Returns:
        Dict with Token Auth configuration
    """
    return {
        "identity_name": identity_name,
        "auth_method": "token-auth",
        "method_info": AUTH_METHODS["token-auth"],
        "deprecated": True,
        "environment_variables": {
            "INFISICAL_TOKEN": token or "${INFISICAL_TOKEN}",
        },
        "config": {},
        "cli_command": "infisical login --method token --token <token>",
        "docker_compose": {
            "INFISICAL_TOKEN": token or "${INFISICAL_TOKEN}",
        },
    }

# =============================================================================
# Machine Identity Templates
# =============================================================================

def _generate_development_machine(identity_name="dev-machine", project_id=None):
    """Generate a development machine identity with broad access."""
    return _generate_universal_auth_config(
        identity_name=identity_name,
        access_paths=[
            "/services/*",
            "/platform/*",
            "/shared/*",
        ],
        project_id=project_id,
        environment="dev",
    )

def _generate_production_machine(identity_name="prod-machine", project_id=None, resource_paths=None):
    """Generate a production machine identity with restricted access."""
    if not resource_paths:
        resource_paths = ["/services/${RESOURCE_NAME}"]
    
    return _generate_universal_auth_config(
        identity_name=identity_name,
        access_paths=resource_paths,
        project_id=project_id,
        environment="prod",
    )

def _generate_ci_machine(identity_name="ci-machine", project_id=None):
    """Generate a CI/CD machine identity for GitHub Actions."""
    return _generate_universal_auth_config(
        identity_name=identity_name,
        access_paths=[
            "/services/*",
            "/platform/*",
        ],
        project_id=project_id,
        environment="dev",
    )

def _generate_resource_specific_machine(resource_name, project_id=None):
    """Generate a machine identity for a specific service only."""
    path = "/services/{}".format(resource_name)
    
    return _generate_universal_auth_config(
        identity_name="{}-machine".format(resource_name),
        access_paths=[path, "{}/*".format(path)],
        project_id=project_id,
        environment="dev",
    )

# =============================================================================
# Machine Identity Registry
# =============================================================================

# Predefined machine identity configurations
PREDEFINED_MACHINES = {
    "machine1": {
        "name": "machine1",
        "display_name": "Machine Identity 1",
        "description": "Primary machine identity for local development",
        "auth_method": "universal-auth",
        "access_level": "project",
        "environments": ["dev", "staging"],
        "access_paths": ["/services/*", "/platform/*"],
    },
    "tilt-local": {
        "name": "tilt-local",
        "display_name": "Tilt Local Development",
        "description": "Machine identity for Tilt local development",
        "auth_method": "universal-auth",
        "access_level": "project",
        "environments": ["dev"],
        "access_paths": ["/services/*"],
    },
    "github-actions": {
        "name": "github-actions",
        "display_name": "GitHub Actions CI/CD",
        "description": "Machine identity for GitHub Actions workflows",
        "auth_method": "universal-auth",
        "access_level": "project",
        "environments": ["dev", "staging", "prod"],
        "access_paths": ["/services/*", "/platform/*"],
    },
    "production-deployer": {
        "name": "production-deployer",
        "display_name": "Production Deployment",
        "description": "Machine identity for production deployments",
        "auth_method": "universal-auth",
        "access_level": "project",
        "environments": ["prod"],
        "access_paths": ["/services/*"],
    },
}

def _get_predefined_machine(machine_name):
    """Get predefined machine configuration."""
    return PREDEFINED_MACHINES.get(machine_name)

def _register_machine(machine_name, config):
    """Register a new machine identity configuration."""
    PREDEFINED_MACHINES[machine_name] = config
    return config

# =============================================================================
# Environment Variable Generation
# =============================================================================

def _generate_env_file_content(machine_config, include_secrets=False):
    """
    Generate .env file content for a machine identity.
    
    Args:
        machine_config: Machine identity configuration
        include_secrets: If True, includes placeholder secret values
    
    Returns:
        String content for .env file
    """
    lines = [
        "# Infisical Machine Identity Configuration",
        "# Identity: {}".format(machine_config.get("identity_name", "unknown")),
        "# Generated: {}".format(_get_timestamp()),
        "#",
        "# ⚠️  SECURITY WARNING: Do not commit this file to Git!",
        "",
        "# Authentication Method",
        "INFISICAL_AUTH_METHOD={}".format(machine_config.get("auth_method", "universal-auth")),
        "",
    ]
    
    # Add method-specific variables
    env_vars = machine_config.get("environment_variables", {})
    for key, value in env_vars.items():
        if include_secrets:
            lines.append("{}={}".format(key, value))
        else:
            lines.append("{}=__replace_with_actual_value__".format(key))
    
    # Add config variables
    config = machine_config.get("config", {})
    if "project_id" in config:
        lines.append("INFISICAL_PROJECT_ID={}".format(config["project_id"]))
    if "environment" in config:
        lines.append("INFISICAL_ENVIRONMENT={}".format(config["environment"]))
    
    lines.extend([
        "",
        "# API Configuration",
        "INFISICAL_API_URL=http://localhost:8089",
    ])
    
    return "\n".join(lines)

# =============================================================================
# Validation
# =============================================================================

def _validate_auth_method(method):
    """Validate authentication method."""
    if method in AUTH_METHODS:
        info = AUTH_METHODS[method]
        return {
            "valid": True,
            "supported": info["supported"],
            "deprecated": info.get("deprecated", False),
            "message": None,
        }
    
    return {
        "valid": False,
        "supported": False,
        "deprecated": False,
        "message": "Unknown auth method: {}".format(method),
    }

def _validate_machine_config(config):
    """Validate machine identity configuration."""
    errors = []
    warnings = []
    
    # Check required fields
    if not config.get("identity_name"):
        errors.append("Missing identity_name")
    
    auth_method = config.get("auth_method", "universal-auth")
    method_validation = _validate_auth_method(auth_method)
    
    if not method_validation["valid"]:
        errors.append(method_validation["message"])
    elif method_validation.get("deprecated"):
        warnings.append("Auth method '{}' is deprecated".format(auth_method))
    elif not method_validation["supported"]:
        warnings.append("Auth method '{}' not yet supported".format(auth_method))
    
    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }

# =============================================================================
# Main API
# =============================================================================

MachineIdentity = struct(
    # Configuration generators
    generate_universal_auth=_generate_universal_auth_config,
    generate_oidc_auth=_generate_oidc_auth_config,
    generate_token_auth=_generate_token_auth_config,
    
    # Templates
    generate_development_machine=_generate_development_machine,
    generate_production_machine=_generate_production_machine,
    generate_ci_machine=_generate_ci_machine,
    generate_resource_specific_machine=_generate_resource_specific_machine,
    
    # Registry
    get_predefined_machine=_get_predefined_machine,
    register_machine=_register_machine,
    predefined_machines=PREDEFINED_MACHINES,
    
    # Environment
    generate_env_file_content=_generate_env_file_content,
    
    # Validation
    validate_auth_method=_validate_auth_method,
    validate_machine_config=_validate_machine_config,
    
    # Constants
    AUTH_METHODS=AUTH_METHODS,
    DEFAULT_MACHINE_CONFIG=DEFAULT_MACHINE_CONFIG,
)
