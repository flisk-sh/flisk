# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📁 INFISICAL PATH MANAGER
# =============================================================================
# Manages Infisical folder/path creation and organization
# Replaces: Shell scripts for creating folders via CLI
# =============================================================================
#
# This module provides:
#   - Folder/path structure definitions
#   - Path validation and normalization
#   - Batch path creation planning
#   - Organization hierarchy management
#
# Usage:
#   load("./infisical/path_manager.star", "PathManager")
#   paths = PathManager.plan_resource_paths(["user", "order"])
# =============================================================================

def _get_timestamp():
    """Get current timestamp string"""
    return str(local("date +%Y-%m-%dT%H:%M:%S", quiet=True)).strip()

# =============================================================================
# Path Constants and Conventions
# =============================================================================

# Root paths in Infisical
ROOT_PATHS = {
    "services": "/services",
    "platform": "/platform",
    "shared": "/shared",
    "infrastructure": "/infrastructure",
}

# Standard sub-paths for services
RESOURCE_SUBPATHS = [
    "",  # Root service folder
    "database",
    "api-keys",
    "tokens",
    "external",
]

# Platform service paths
PLATFORM_PATHS = {
    "api-gateway": "/platform/api-gateway",
    "database": "/platform/database",
    "messaging": "/platform/messaging",
    "observability": "/platform/observability",
    "security": "/platform/security",
}

# Shared secrets paths
SHARED_PATHS = {
    "database-credentials": "/shared/database-credentials",
    "api-tokens": "/shared/api-tokens",
    "encryption-keys": "/shared/encryption-keys",
    "certificates": "/shared/certificates",
}

# Infrastructure paths
INFRASTRUCTURE_PATHS = {
    "postgres": "/infrastructure/postgres",
    "redis": "/infrastructure/redis",
    "nats": "/infrastructure/nats",
    "infisical": "/infrastructure/infisical",
    "traefik": "/infrastructure/traefik",
}

# =============================================================================
# Path Validation
# =============================================================================

def _normalize_path(path):
    """
    Normalize a path to Infisical format.
    
    Rules:
    - Must start with /
    - No trailing slash (except root "/")
    - Lowercase
    - No spaces
    - No consecutive slashes
    
    Args:
        path: Raw path string
    
    Returns:
        Normalized path string
    """
    if not path:
        return ""
    
    # Lowercase
    path = path.lower()
    
    # Ensure leading slash
    if not path.startswith("/"):
        path = "/" + path
    
    # Remove trailing slash (except for root)
    if path != "/" and path.endswith("/"):
        path = path[:-1]
    
    # Replace spaces with hyphens
    path = path.replace(" ", "-")
    
    # Remove consecutive slashes
    while "//" in path:
        path = path.replace("//", "/")
    
    return path

def _validate_path(path, strict=False):
    """
    Validate an Infisical path.
    
    Args:
        path: Path to validate
        strict: If True, enforces stricter rules
    
    Returns:
        Dict with validation results:
        {
            "valid": bool,
            "normalized": str,
            "errors": [str],
            "warnings": [str],
        }
    """
    errors = []
    warnings = []
    
    if not path:
        errors.append("Path cannot be empty")
        return {"valid": False, "normalized": "", "errors": errors, "warnings": warnings}
    
    normalized = _normalize_path(path)
    
    # Ensure normalized is a string
    if type(normalized) != "string":
        normalized = str(normalized)
    
    # Check valid characters
    valid_chars = "abcdefghijklmnopqrstuvwxyz0123456789-_/"
    invalid_chars = []
    for i in range(len(normalized)):
        c = normalized[i]
        if c not in valid_chars:
            invalid_chars.append(c)
    if len(invalid_chars) > 0:
        errors.append("Invalid characters: {}".format(invalid_chars))
    
    # Check depth limit (Infisical max is 20)
    parts = []
    for p in normalized.split("/"):
        if p:
            parts.append(p)
    if len(parts) > 20:
        errors.append("Path depth {} exceeds maximum (20)".format(len(parts)))
    
    # Check segment length (max 255 per segment)
    for part in parts:
        if len(part) > 255:
            errors.append("Path segment '{}' too long (max 255)".format(part[:20]))
    
    # Check total length
    if len(normalized) > 1024:
        errors.append("Path too long (max 1024 characters)")
    
    # Strict mode checks
    if strict:
        # Must follow /services/ or /platform/ or /shared/ convention
        if len(parts) >= 1 and parts[0] not in ["services", "platform", "shared", "infrastructure"]:
            warnings.append("Path not under standard root (/services, /platform, /shared, /infrastructure)")
        
        # Check for reserved names
        reserved = [".git", ".env", "admin", "root", "system"]
        for part in parts:
            if part in reserved:
                errors.append("Reserved name not allowed: '{}'".format(part))
    
    return {
        "valid": len(errors) == 0,
        "normalized": normalized,
        "errors": errors,
        "warnings": warnings,
    }

def _is_valid_path(path):
    """Quick validation check."""
    result = _validate_path(path)
    return result["valid"]

# =============================================================================
# Path Planning
# =============================================================================

def _plan_resource_path(resource_name, resource_type="backend", parent_path=None):
    """
    Plan the Infisical path for a service.
    
    Args:
        resource_name: Name of the service
        resource_type: Type of service
        parent_path: Optional custom parent path (default: /services)
    
    Returns:
        Dict with path plan
    """
    # Normalize service name for path
    normalized_name = resource_name.lower().replace(" ", "-").replace("_", "-")
    
    # Determine parent path
    if parent_path:
        parent = _normalize_path(parent_path)
    elif resource_type == "platform":
        parent = ROOT_PATHS["platform"]
    elif resource_type == "infrastructure":
        parent = ROOT_PATHS["infrastructure"]
    else:
        parent = ROOT_PATHS["services"]
    
    # Build full path
    full_path = "{}/{}".format(parent, normalized_name)
    
    # Validate
    validation = _validate_path(full_path, strict=True)
    
    return {
        "resource_name": resource_name,
        "resource_type": resource_type,
        "parent_path": parent,
        "resource_folder": normalized_name,
        "full_path": validation["normalized"],
        "validation": validation,
        "subpaths": ["{}/{}".format(validation["normalized"], sub) for sub in RESOURCE_SUBPATHS if sub],
    }

def _plan_batch_resource_paths(resource_names, resource_type="backend", parent_path=None):
    """
    Plan paths for multiple services.
    
    Args:
        resource_names: List of service names
        resource_type: Default type for all services
        parent_path: Optional custom parent path
    
    Returns:
        Dict mapping service names to their path plans
    """
    results = {}
    
    for name in resource_names:
        results[name] = _plan_resource_path(name, resource_type, parent_path)
    
    return results

def _plan_organization_structure(org_name, resource_names=None):
    """
    Plan complete organization folder structure.
    
    Args:
        org_name: Organization name
        resource_names: List of service names to create under /services
    
    Returns:
        Dict with complete structure plan
    """
    structure = {
        "organization": org_name,
        "roots": {},
        "services": {},
        "platform": {},
        "shared": {},
        "infrastructure": {},
    }
    
    # Root paths
    for name, path in ROOT_PATHS.items():
        structure["roots"][name] = {
            "path": path,
            "purpose": _get_root_purpose(name),
        }
    
    # Platform paths
    for name, path in PLATFORM_PATHS.items():
        structure["platform"][name] = {
            "path": path,
            "purpose": _get_platform_purpose(name),
        }
    
    # Shared paths
    for name, path in SHARED_PATHS.items():
        structure["shared"][name] = {
            "path": path,
            "purpose": _get_shared_purpose(name),
        }
    
    # Infrastructure paths
    for name, path in INFRASTRUCTURE_PATHS.items():
        structure["infrastructure"][name] = {
            "path": path,
            "purpose": _get_infrastructure_purpose(name),
        }
    
    # Service paths
    if resource_names:
        structure["services"] = _plan_batch_resource_paths(resource_names)
    
    return structure

def _get_root_purpose(name):
    """Get description for root path."""
    purposes = {
        "services": "Application service secrets",
        "platform": "Platform infrastructure secrets",
        "shared": "Cross-service shared secrets",
        "infrastructure": "Infrastructure component secrets",
    }
    return purposes.get(name, "General secrets")

def _get_platform_purpose(name):
    """Get description for platform path."""
    purposes = {
        "api-gateway": "API Gateway configuration and tokens",
        "database": "Database cluster credentials",
        "messaging": "NATS and message broker secrets",
        "observability": "Monitoring and logging secrets",
        "security": "Security service secrets",
    }
    return purposes.get(name, "Platform service secrets")

def _get_shared_purpose(name):
    """Get description for shared path."""
    purposes = {
        "database-credentials": "Shared database credentials",
        "api-tokens": "Shared API tokens",
        "encryption-keys": "Encryption and signing keys",
        "certificates": "TLS certificates and keys",
    }
    return purposes.get(name, "Shared secrets")

def _get_infrastructure_purpose(name):
    """Get description for infrastructure path."""
    purposes = {
        "postgres": "PostgreSQL cluster secrets",
        "redis": "Redis cluster secrets",
        "nats": "NATS server secrets",
        "infisical": "Infisical self-secrets",
        "traefik": "Traefik proxy secrets",
    }
    return purposes.get(name, "Infrastructure secrets")

# =============================================================================
# Path Operations
# =============================================================================

def _get_parent_path(path):
    """Get parent path of a given path."""
    normalized = _normalize_path(path)
    parts = [p for p in normalized.split("/") if p]
    
    if len(parts) <= 1:
        return "/"
    
    return "/" + "/".join(parts[:-1])

def _get_path_depth(path):
    """Get depth of path (number of segments)."""
    normalized = _normalize_path(path)
    parts = [p for p in normalized.split("/") if p]
    return len(parts)

def _join_paths(base, *parts):
    """Join path parts safely."""
    result = _normalize_path(base)
    
    for part in parts:
        normalized_part = _normalize_path(part)
        if normalized_part.startswith("/"):
            normalized_part = normalized_part[1:]
        
        if result == "/":
            result = "/" + normalized_part
        else:
            result = result + "/" + normalized_part
    
    return _normalize_path(result)

def _path_to_env_var(path):
    """Convert Infisical path to environment variable name."""
    # Remove leading slash and replace / with _
    normalized = _normalize_path(path)
    if normalized.startswith("/"):
        normalized = normalized[1:]
    
    return normalized.replace("/", "_").replace("-", "_").upper()

# =============================================================================
# Service Path Registry
# =============================================================================

# Predefined service paths for known services
KNOWN_RESOURCE_PATHS = {
    # Simple services
    "user-management-backend": "/services/user",
    "order-management-backend": "/services/order",
    "order-planner-backend": "/services/order-planner",
    "team-management-backend": "/services/team",
    "service-management-backend": "/services/service",
    "products-management-backend": "/services/products",
    "website-management-backend": "/services/website",
    "gdpr-compliance-backend": "/services/gdpr",
    
    # Complex services
    "payment-management-backend": "/services/payment",
    "payment-processing-backend": "/services/payments",
    "notification-backend": "/services/notification",
    
    # Platform services
    "api-gateway": "/services/api-gateway",
    "api-gateway-test": "/services/api-gateway-test",
    "orchestrator-glue-backend": "/services/orchestrator-glue",
    "service-discovery-agent": "/platform/service-discovery",
    "synthetic-monitor": "/platform/synthetic-monitor",
    
    # NATS services
    "nats-http-bridge": "/platform/nats-http-bridge",
    "nats-http-bridge-v2": "/platform/nats-http-bridge-v2",
    "nats-connector": "/platform/nats-connector",
}

def _get_known_resource_path(resource_name):
    """Get predefined path for a known service."""
    return KNOWN_RESOURCE_PATHS.get(resource_name)

def _register_resource_path(resource_name, path):
    """Register a new service path."""
    normalized = _normalize_path(path)
    KNOWN_RESOURCE_PATHS[resource_name] = normalized
    return normalized

# =============================================================================
# Main API
# =============================================================================

PathManager = struct(
    # Path planning
    plan_resource_path=_plan_resource_path,
    plan_batch_resource_paths=_plan_batch_resource_paths,
    plan_organization_structure=_plan_organization_structure,
    
    # Validation
    validate_path=_validate_path,
    normalize_path=_normalize_path,
    is_valid_path=_is_valid_path,
    
    # Operations
    get_parent_path=_get_parent_path,
    get_path_depth=_get_path_depth,
    join_paths=_join_paths,
    path_to_env_var=_path_to_env_var,
    
    # Registry
    get_known_resource_path=_get_known_resource_path,
    register_resource_path=_register_resource_path,
    known_paths=KNOWN_RESOURCE_PATHS,
    
    # Constants
    ROOT_PATHS=ROOT_PATHS,
    PLATFORM_PATHS=PLATFORM_PATHS,
    SHARED_PATHS=SHARED_PATHS,
    INFRASTRUCTURE_PATHS=INFRASTRUCTURE_PATHS,
    RESOURCE_SUBPATHS=RESOURCE_SUBPATHS,
)
