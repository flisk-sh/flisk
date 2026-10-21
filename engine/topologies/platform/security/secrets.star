# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔐 INFISICAL SECURITY MODULE
# =============================================================================
# Centralizes Infisical secrets management configuration
# =============================================================================
#
# This module provides:
#   - Infrastructure loading (Infisical containers)
#   - Secret injection configuration for services
#   - Machine identity management
#   - Organization and path management
#
# Usage:
#   load("../../platform/security/secrets.star", "Secrets")
#   
#   # Load Infisical infrastructure
#   Secrets.load_infra(should_enable_fn)
#   
#   # Configure service secrets
#   config = Secrets.configure_service("my-service", "/services/my-service")
# =============================================================================

# Infrastructure loader
load("../../tilt/resources/infra-loader.star", _Infra="Infra")

# Generators
load("../../tilt/generators/infisical/index.star", _Infisical="Infisical")

# Docker layers integration
load("../../platform/docker/layers/infisical/index.star", "InfisicalLayers")

# =============================================================================
# Infrastructure Loading
# =============================================================================

def _load_infra(should_enable):
    """Load Infisical infrastructure containers."""
    return _Infra.load_infisical(should_enable)

# =============================================================================
# Resource Secret Configuration
# =============================================================================

def _configure_service(resource_name, secret_path, resource_type="backend", command=None):
    """
    Configure secret injection for a resource.

    Args:
        resource_name: Name of the resource
        secret_path: Infisical path (e.g., "/services/my-service")
        resource_type: Type of resource (backend, frontend, worker, etc.)
        command: Entrypoint command (optional)

    Returns:
        Configuration dict for the resource
    """
    return _Infisical.Secrets.generate_for_service(
        resource_name=resource_name,
        secret_path=secret_path,
        resource_type=resource_type,
        command=command,
    )

def _configure_services_batch(services_config):
    """
    Configure secrets for multiple resources.

    Args:
        services_config: List of dicts with resource configuration

    Returns:
        Dict mapping resource names to configurations
    """
    return _Infisical.Secrets.generate_for_services_batch(services_config)

# =============================================================================
# Path Management
# =============================================================================

def _plan_resource_path(resource_name, resource_type="backend"):
    """Plan Infisical path for a resource."""
    return _Infisical.Paths.plan_resource_path(resource_name, resource_type)

def _plan_batch_paths(resource_names, resource_type="backend"):
    """Plan paths for multiple resources."""
    return _Infisical.Paths.plan_batch_resource_paths(resource_names, resource_type)

def _get_known_resource_path(resource_name):
    """Get predefined path for a known resource."""
    return _Infisical.Paths.get_known_resource_path(resource_name)

# =============================================================================
# Machine Identity
# =============================================================================

def _generate_machine_identity(identity_name, access_paths=None, project_id=None):
    """
    Generate machine identity configuration.
    
    Args:
        identity_name: Name of the machine identity
        access_paths: List of paths the identity can access
        project_id: Project ID
    
    Returns:
        Machine identity configuration
    """
    return _Infisical.Identity.generate_universal_auth(
        identity_name=identity_name,
        access_paths=access_paths,
        project_id=project_id,
    )

def _get_development_machine(project_id=None):
    """Get development machine identity configuration."""
    return _Infisical.Identity.generate_development_machine(
        identity_name="dev-machine",
        project_id=project_id,
    )

def _get_ci_machine(project_id=None):
    """Get CI/CD machine identity configuration."""
    return _Infisical.Identity.generate_ci_machine(project_id=project_id)

# =============================================================================
# Organization Setup
# =============================================================================

def _generate_org_config(org_name=None, environments=None, resource_names=None):
    """
    Generate organization configuration.
    
    Args:
        org_name: Organization name
        environments: List of environment names
        resource_names: List of service names
    
    Returns:
        Organization configuration dict
    """
    return _Infisical.Org.generate_config(
        org_name=org_name,
        env_names=environments,
        resource_names=resource_names,
    )

# =============================================================================
# Predefined Services Configuration
# =============================================================================

# Project-specific service configurations should be defined in .tdk/project.json
# This dict is kept for backward compatibility but should be empty for generic Flisk CLI
PREDEFINED_RESOURCES = {}

def _get_predefined_resource_config(resource_name):
    """Get predefined configuration for a known resource."""
    return PREDEFINED_RESOURCES.get(resource_name)

def _configure_predefined_service(resource_name, command=None):
    """
    Configure a predefined resource by name.

    Args:
        resource_name: Name of the predefined resource
        command: Entrypoint command (optional)

    Returns:
        Resource configuration or None if not predefined
    """
    config = _get_predefined_resource_config(resource_name)
    if not config:
        return None
    
    return _configure_service(
        resource_name=resource_name,
        secret_path=config["path"],
        resource_type=config["type"],
        command=command,
    )

# =============================================================================
# Batch Configuration for All Resources
# =============================================================================

def _configure_all_predefined_services(command=None):
    """
    Configure all predefined resources.

    Args:
        command: Default entrypoint command (optional)

    Returns:
        Dict mapping resource names to configurations
    """
    results = {}
    
    for resource_name in PREDEFINED_RESOURCES:
        config = _configure_predefined_service(resource_name, command)
        if config:
            results[resource_name] = config
    
    return results

# =============================================================================
# Public API
# =============================================================================

Secrets = struct(
    # Infrastructure
    load_infra=_load_infra,

    # Resource configuration
    configure_service=_configure_service,
    configure_services_batch=_configure_services_batch,
    configure_predefined_service=_configure_predefined_service,
    configure_all_predefined_services=_configure_all_predefined_services,
    
    # Path management
    plan_resource_path=_plan_resource_path,
    plan_batch_paths=_plan_batch_paths,
    get_known_resource_path=_get_known_resource_path,
    
    # Machine identity
    generate_machine_identity=_generate_machine_identity,
    get_development_machine=_get_development_machine,
    get_ci_machine=_get_ci_machine,
    
    # Organization
    generate_org_config=_generate_org_config,
    
    # Constants
    PREDEFINED_RESOURCES=PREDEFINED_RESOURCES,
    
    # Direct access to submodules
    Infisical=_Infisical,
    
    # Docker layers integration
    Layers=InfisicalLayers,
)
