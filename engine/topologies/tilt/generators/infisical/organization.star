# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🏢 INFISICAL ORGANIZATION MANAGER
# =============================================================================
# Manages Infisical organization configuration and setup
# Replaces: Manual UI organization creation
# =============================================================================
#
# This module provides:
#   - Organization structure definitions
#   - Project configuration templates
#   - Environment setup (dev, staging, prod)
#   - Role and permission templates
#
# Usage:
#   load("./infisical/organization.star", "Organization")
#   config = Organization.generate_config("my-project", ["dev", "staging", "prod"])
# =============================================================================

# Load project name for dynamic defaults
# Use TDK_PROJECT_ROOT env var set by Tilt, fallback to current directory
def _load_project_names():
    project_root = os.environ.get('TDK_PROJECT_ROOT', '')
    project_json_path = '.tdk/project.json'
    if project_root:
        project_json_path = project_root + '/' + project_json_path
    
    if os.path.exists(project_json_path):
        _project_json = read_json(project_json_path)
        _PROJECT_NAME = _project_json.get('project', {}).get('name', 'tdk-project')
        _PROJECT_NAME_DISPLAY = _PROJECT_NAME.replace('-', ' ').title()
        return _PROJECT_NAME, _PROJECT_NAME_DISPLAY
    return 'tdk-project', 'Tdk Project'

_PROJECT_NAME, _PROJECT_NAME_DISPLAY = _load_project_names()

def _get_timestamp():
    """Get current timestamp string"""
    return str(local("date +%Y-%m-%dT%H:%M:%S", quiet=True)).strip()

# =============================================================================
# Organization Structure
# =============================================================================

DEFAULT_ORGANIZATION = {
    "name": _PROJECT_NAME,
    "display_name": _PROJECT_NAME_DISPLAY,
    "slug": _PROJECT_NAME,
    "description": _PROJECT_NAME_DISPLAY + " Platform - Multi-tenant SaaS",
}

DEFAULT_PROJECT = {
    "name": _PROJECT_NAME + "-secrets",
    "display_name": _PROJECT_NAME_DISPLAY + " Secrets",
    "slug": _PROJECT_NAME + "-secrets",
    "description": "Secrets management for " + _PROJECT_NAME_DISPLAY + " platform services",
}

# =============================================================================
# Environment Configuration
# =============================================================================

ENVIRONMENTS = {
    "dev": {
        "name": "dev",
        "display_name": "Development",
        "slug": "dev",
        "description": "Local development environment",
        "color": "#22c55e",  # Green
        "position": 1,
        "auto_sync": True,
    },
    "staging": {
        "name": "staging",
        "display_name": "Staging",
        "slug": "staging",
        "description": "Pre-production testing environment",
        "color": "#f59e0b",  # Amber
        "position": 2,
        "auto_sync": True,
    },
    "prod": {
        "name": "prod",
        "display_name": "Production",
        "slug": "prod",
        "description": "Production environment",
        "color": "#ef4444",  # Red
        "position": 3,
        "auto_sync": False,  # Manual sync for safety
        "requires_approval": True,
    },
}

def _generate_environment_config(env_name):
    """Generate configuration for a specific environment."""
    if env_name in ENVIRONMENTS:
        return ENVIRONMENTS[env_name]
    
    return {
        "name": env_name,
        "display_name": env_name.capitalize(),
        "slug": env_name.lower(),
        "description": "Custom environment",
        "color": "#6b7280",  # Gray
        "position": 99,
        "auto_sync": False,
    }

def _generate_all_environments(env_names=None):
    """Generate configurations for multiple environments."""
    if not env_names:
        env_names = ["dev", "staging", "prod"]
    
    return {name: _generate_environment_config(name) for name in env_names}

# =============================================================================
# Role and Permission Templates
# =============================================================================

ROLES = {
    "admin": {
        "name": "admin",
        "display_name": "Administrator",
        "description": "Full access to all secrets and settings",
        "permissions": [
            "secrets:read",
            "secrets:write",
            "secrets:delete",
            "folders:read",
            "folders:write",
            "folders:delete",
            "identities:read",
            "identities:write",
            "identities:delete",
            "projects:read",
            "projects:write",
            "environments:read",
            "environments:write",
        ],
    },
    "developer": {
        "name": "developer",
        "display_name": "Developer",
        "description": "Read/write access to service secrets",
        "permissions": [
            "secrets:read",
            "secrets:write",
            "folders:read",
            "folders:write",
            "identities:read",
        ],
    },
    "readonly": {
        "name": "readonly",
        "display_name": "Read Only",
        "description": "Read-only access to secrets",
        "permissions": [
            "secrets:read",
            "folders:read",
        ],
    },
    "service": {
        "name": "service",
        "display_name": "Service Account",
        "description": "Machine identity role for services",
        "permissions": [
            "secrets:read",
            "folders:read",
        ],
        "machine_identity_only": True,
    },
    "ci": {
        "name": "ci",
        "display_name": "CI/CD",
        "description": "Continuous integration role",
        "permissions": [
            "secrets:read",
            "secrets:write:dev",
            "folders:read",
        ],
        "machine_identity_only": True,
    },
}

def _generate_role_config(role_name):
    """Generate configuration for a role."""
    if role_name in ROLES:
        return ROLES[role_name]
    
    return {
        "name": role_name,
        "display_name": role_name.capitalize(),
        "description": "Custom role",
        "permissions": ["secrets:read"],
    }

# =============================================================================
# Folder Structure Templates
# =============================================================================

FOLDER_TEMPLATES = {
    "services": {
        "name": "services",
        "description": "Application service secrets",
        "children": [],  # Populated dynamically
    },
    "platform": {
        "name": "platform",
        "description": "Platform infrastructure secrets",
        "children": [
            {"name": "api-gateway", "description": "API Gateway configuration"},
            {"name": "database", "description": "Database credentials"},
            {"name": "messaging", "description": "NATS and message broker secrets"},
            {"name": "observability", "description": "Monitoring and logging"},
            {"name": "security", "description": "Security service secrets"},
        ],
    },
    "shared": {
        "name": "shared",
        "description": "Shared secrets across services",
        "children": [
            {"name": "database-credentials", "description": "Shared database credentials"},
            {"name": "api-tokens", "description": "Shared API tokens"},
            {"name": "encryption-keys", "description": "Encryption and signing keys"},
            {"name": "certificates", "description": "TLS certificates"},
        ],
    },
    "infrastructure": {
        "name": "infrastructure",
        "description": "Infrastructure component secrets",
        "children": [
            {"name": "postgres", "description": "PostgreSQL cluster secrets"},
            {"name": "redis", "description": "Redis cluster secrets"},
            {"name": "nats", "description": "NATS server secrets"},
            {"name": "infisical", "description": "Infisical self-secrets"},
            {"name": "traefik", "description": "Traefik proxy secrets"},
        ],
    },
}

def _generate_folder_structure(resource_names=None):
    """
    Generate complete folder structure for organization.
    
    Args:
        resource_names: List of service names to create under /services
    
    Returns:
        Dict with complete folder structure
    """
    structure = {}
    
    for template_name, template in FOLDER_TEMPLATES.items():
        folder = dict(template)  # Copy
        
        # Add service folders under /services
        if template_name == "services" and resource_names:
            for resource_name in resource_names:
                folder["children"].append({
                    "name": resource_name,
                    "description": "{} service secrets".format(resource_name),
                })
        
        structure[template_name] = folder
    
    return structure

# =============================================================================
# Secret Templates
# =============================================================================

SECRET_TEMPLATES = {
    "database": {
        "DATABASE_URL": {
            "type": "string",
            "description": "PostgreSQL connection string",
            "example": "postgresql://user:pass@localhost:5432/dbname",
        },
        "DB_HOST": {
            "type": "string",
            "description": "Database hostname",
            "example": "postgres",
        },
        "DB_PORT": {
            "type": "number",
            "description": "Database port",
            "example": "5432",
        },
        "DB_NAME": {
            "type": "string",
            "description": "Database name",
            "example": _PROJECT_NAME + "_service",
        },
        "DB_USER": {
            "type": "string",
            "description": "Database user",
            "example": "postgres",
        },
        "DB_PASSWORD": {
            "type": "string",
            "description": "Database password",
            "sensitive": True,
        },
    },
    "jwt": {
        "JWT_SECRET": {
            "type": "string",
            "description": "JWT signing secret",
            "sensitive": True,
        },
        "JWT_EXPIRATION": {
            "type": "string",
            "description": "JWT expiration time",
            "example": "24h",
        },
        "JWT_ISSUER": {
            "type": "string",
            "description": "JWT issuer",
            "example": _PROJECT_NAME,
        },
    },
    "api": {
        "RESOURCE_API_KEY": {
            "type": "string",
            "description": "Service API key for inter-service communication",
            "sensitive": True,
        },
        "API_GATEWAY_TOKEN": {
            "type": "string",
            "description": "API Gateway authentication token",
            "sensitive": True,
        },
    },
    "redis": {
        "REDIS_URL": {
            "type": "string",
            "description": "Redis connection string",
            "example": "redis://localhost:6379",
        },
        "REDIS_HOST": {
            "type": "string",
            "description": "Redis hostname",
            "example": "redis",
        },
        "REDIS_PORT": {
            "type": "number",
            "description": "Redis port",
            "example": "6379",
        },
    },
    "nats": {
        "NATS_URL": {
            "type": "string",
            "description": "NATS server URL",
            "example": "nats://localhost:4222",
        },
        "NATS_HOST": {
            "type": "string",
            "description": "NATS hostname",
            "example": "nats",
        },
        "NATS_PORT": {
            "type": "number",
            "description": "NATS port",
            "example": "4222",
        },
    },
    "payment": {
        "STRIPE_SECRET_KEY": {
            "type": "string",
            "description": "Stripe API secret key",
            "sensitive": True,
        },
        "STRIPE_WEBHOOK_SECRET": {
            "type": "string",
            "description": "Stripe webhook endpoint secret",
            "sensitive": True,
        },
        "STRIPE_PUBLISHABLE_KEY": {
            "type": "string",
            "description": "Stripe publishable key",
        },
    },
    "email": {
        "SMTP_HOST": {
            "type": "string",
            "description": "SMTP server hostname",
        },
        "SMTP_PORT": {
            "type": "number",
            "description": "SMTP server port",
        },
        "SMTP_USER": {
            "type": "string",
            "description": "SMTP username",
        },
        "SMTP_PASSWORD": {
            "type": "string",
            "description": "SMTP password",
            "sensitive": True,
        },
        "SENDGRID_API_KEY": {
            "type": "string",
            "description": "SendGrid API key",
            "sensitive": True,
        },
    },
}

def _generate_secrets_for_service(resource_type="backend"):
    """
    Generate secret templates for a service type.
    
    Args:
        resource_type: Type of service (backend, frontend, payment, etc.)
    
    Returns:
        Dict with secret templates
    """
    secrets = {}
    
    # All services get these
    secrets.update(SECRET_TEMPLATES["database"])
    secrets.update(SECRET_TEMPLATES["jwt"])
    secrets.update(SECRET_TEMPLATES["api"])
    
    # Type-specific secrets
    if resource_type in ["backend", "api-gateway"]:
        secrets.update(SECRET_TEMPLATES["redis"])
        secrets.update(SECRET_TEMPLATES["nats"])
    
    if resource_type == "payment":
        secrets.update(SECRET_TEMPLATES["payment"])
    
    if resource_type == "notification":
        secrets.update(SECRET_TEMPLATES["email"])
    
    return secrets

# =============================================================================
# Complete Organization Configuration
# =============================================================================

def _generate_organization_config(org_name=None, project_name=None, env_names=None, resource_names=None):
    """
    Generate complete organization configuration.

    Args:
        org_name: Organization name (default: from project.json or 'tdk-project')
        project_name: Project name (default: {org_name}-secrets)
        env_names: List of environments (default: [dev, staging, prod])
        resource_names: List of services to create folders for

    Returns:
        Dict with complete organization configuration
    """
    org = DEFAULT_ORGANIZATION.copy()
    if org_name:
        org["name"] = org_name
        org["slug"] = org_name.lower().replace(" ", "-")
        org["display_name"] = org_name.replace("-", " ").title()
    
    project = DEFAULT_PROJECT.copy()
    if project_name:
        project["name"] = project_name
        project["slug"] = project_name.lower().replace(" ", "-")
        project["display_name"] = project_name.replace("-", " ").title()
    
    if not env_names:
        env_names = ["dev", "staging", "prod"]
    
    return {
        "organization": org,
        "project": project,
        "environments": _generate_all_environments(env_names),
        "roles": ROLES,
        "folder_structure": _generate_folder_structure(resource_names),
        "secret_templates": SECRET_TEMPLATES,
        "generated_at": _get_timestamp(),
    }

# =============================================================================
# Validation
# =============================================================================

def _validate_organization_config(config):
    """Validate organization configuration."""
    errors = []
    warnings = []
    
    # Check required fields
    if not config.get("organization", {}).get("name"):
        errors.append("Missing organization name")
    
    if not config.get("project", {}).get("name"):
        errors.append("Missing project name")
    
    # Check environments
    envs = config.get("environments", {})
    if not envs:
        warnings.append("No environments configured")
    
    # Check for prod
    if "prod" not in envs:
        warnings.append("No production environment configured")
    
    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }

# =============================================================================
# Main API
# =============================================================================

Organization = struct(
    # Configuration generators
    generate_config=_generate_organization_config,
    generate_environment=_generate_environment_config,
    generate_role=_generate_role_config,
    generate_folder_structure=_generate_folder_structure,
    generate_secrets_for_service=_generate_secrets_for_service,
    
    # Validation
    validate_config=_validate_organization_config,
    
    # Templates
    DEFAULT_ORGANIZATION=DEFAULT_ORGANIZATION,
    DEFAULT_PROJECT=DEFAULT_PROJECT,
    ENVIRONMENTS=ENVIRONMENTS,
    ROLES=ROLES,
    FOLDER_TEMPLATES=FOLDER_TEMPLATES,
    SECRET_TEMPLATES=SECRET_TEMPLATES,
)
