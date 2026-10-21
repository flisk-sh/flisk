# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔐 INFISICAL STARLARK GENERATORS - USAGE EXAMPLES
# =============================================================================
# This file demonstrates how to use the new Infisical Starlark generators
# =============================================================================

# =============================================================================
# 1. Load the modules
# =============================================================================

# Option 1: Load the complete Infisical module
load("engine/topologies/tilt/generators/infisical/index.star", "Infisical")

# Option 2: Load individual submodules
load("engine/topologies/tilt/generators/infisical/secrets_generator.star", "SecretsGenerator")
load("engine/topologies/tilt/generators/infisical/path_manager.star", "PathManager")
load("engine/topologies/tilt/generators/infisical/machine_identity.star", "MachineIdentity")
load("engine/topologies/tilt/generators/infisical/organization.star", "Organization")

# Option 3: Load from the generators index (recommended)
load("engine/topologies/tilt/generators/index.star", "Generators")
Infisical = Generators.SecretsManagement

# Option 4: Load from security module (complete integration)
load("engine/topologies/platform/security/secrets.star", "Secrets")

# =============================================================================
# 2. Generate Secret Configuration for a Service
# =============================================================================

def example_resource_secrets():
    """Example: Configure secrets for a single service."""
    
    # Generate configuration for user service
    config = Infisical.Secrets.generate_for_service(
        resource_name="user-management-backend",
        secret_path="/services/user",
        resource_type="backend",
        command="bun run src/index.ts",
    )
    
    # Access the generated configuration
    print("Service:", config["resource_name"])
    print("Path:", config["secret_path"])
    print("Required Secrets:", config["required_secrets"])
    print("Docker Compose Env:", config["docker_compose"]["environment"])
    
    return config

# =============================================================================
# 3. Plan Folder Structure
# =============================================================================

def example_path_planning():
    """Example: Plan Infisical folder structure."""
    
    # Plan a single service path
    user_path = Infisical.Paths.plan_resource_path(
        resource_name="user-management-backend",
        resource_type="backend",
    )
    print("User Path:", user_path["full_path"])
    print("Subpaths:", user_path["subpaths"])
    
    # Plan multiple services at once
    batch_paths = Infisical.Paths.plan_batch_resource_paths([
        "user-management-backend",
        "order-management-backend",
        "team-management-backend",
    ])
    
    for name, plan in batch_paths.items():
        print("Service: {}, Path: {}".format(name, plan["full_path"]))
    
    # Plan complete organization structure (example org name)
    org_structure = Infisical.Paths.plan_organization_structure(
        org_name="my-project",
        resource_names=[
            "user",
            "order",
            "team",
            "service",
            "products",
            "website",
            "gdpr",
            "payment",
        ],
    )
    
    print("Organization:", org_structure["organization"])
    print("Services:", org_structure["services"].keys())

# =============================================================================
# 4. Machine Identity Configuration
# =============================================================================

def example_machine_identity():
    """Example: Configure machine identity."""
    
    # Development machine with broad access
    dev_machine = Infisical.Identity.generate_development_machine(
        identity_name="dev-machine",
        project_id="bc7cf07f-4002-4148-bca8-78a05c95dea2",
    )
    print("Dev Machine:", dev_machine["identity_name"])
    print("Auth Method:", dev_machine["auth_method"])
    print("Access Paths:", dev_machine["config"]["access_paths"])
    
    # Service-specific machine with restricted access
    resource_machine = Infisical.Identity.generate_resource_specific_machine(
        resource_name="user",
        project_id="bc7cf07f-4002-4148-bca8-78a05c95dea2",
    )
    print("Service Machine Access:", resource_machine["config"]["access_paths"])
    
    # CI/CD machine for GitHub Actions
    ci_machine = Infisical.Identity.generate_ci_machine(
        identity_name="github-actions",
        project_id="bc7cf07f-4002-4148-bca8-78a05c95dea2",
    )
    print("CI Machine:", ci_machine["identity_name"])

# =============================================================================
# 5. Organization Configuration
# =============================================================================

def example_organization():
    """Example: Generate organization configuration."""
    
    # Complete organization setup (example org name)
    org = Infisical.Org.generate_config(
        org_name="my-project",
        env_names=["dev", "staging", "prod"],
        resource_names=[
            "user",
            "order",
            "team",
            "service",
            "products",
            "website",
            "gdpr",
            "payment",
        ],
    )
    
    print("Organization:", org["organization"]["name"])
    print("Project:", org["project"]["name"])
    print("Environments:", org["environments"].keys())
    print("Roles:", org["roles"].keys())
    print("Folder Structure:", org["folder_structure"].keys())

# =============================================================================
# 6. Batch Configuration for Multiple Services
# =============================================================================

def example_batch_configuration():
    """Example: Configure multiple services at once."""
    
    services_config = [
        {
            "name": "user-management-backend",
            "path": "/services/user",
            "type": "backend",
            "command": "bun run src/index.ts",
        },
        {
            "name": "payment-management-backend",
            "path": "/services/payment",
            "type": "payment",
            "command": "bun run src/index.ts",
        },
        {
            "name": "api-gateway",
            "path": "/services/api-gateway",
            "type": "api-gateway",
            "command": "bun run src/index.ts",
        },
    ]
    
    # Generate configs for all services
    configs = Infisical.Secrets.generate_for_services_batch(services_config)
    
    for name, config in configs.items():
        print("Service: {}".format(name))
        print("  Valid: {}".format(config["validation"]["valid"]))
        print("  Required Secrets: {}".format(config["required_secrets"]))

# =============================================================================
# 7. Using Predefined Services (via Secrets module)
# =============================================================================

def example_predefined_services():
    """Example: Use predefined service configurations."""
    
    # Get configuration for a predefined service
    config = Secrets.configure_predefined_service(
        resource_name="user-management-backend",
        command="bun run src/index.ts",
    )
    
    if config:
        print("Configured:", config["resource_name"])
        print("Path:", config["secret_path"])
    
    # Configure all predefined services at once
    all_configs = Secrets.configure_all_predefined_services(
        command="bun run src/index.ts",
    )
    
    print("Configured {} services".format(len(all_configs)))
    for name in all_configs:
        print("  - {}".format(name))

# =============================================================================
# 8. Complete Integration Example (in Tiltfile)
# =============================================================================

"""
# Example Tiltfile usage:

load("engine/topologies/platform/security/secrets.star", "Secrets")
load("engine/topologies/tilt/generators/infisical/path_manager.star", "PathManager")

def configure_resource_with_secrets(resource_name):
    # Get predefined config or plan new one
    config = Secrets.configure_predefined_service(resource_name)
    
    if not config:
        # Plan path for unknown service
        path_plan = PathManager.plan_resource_path(resource_name)
        config = Secrets.configure_service(
            resource_name=resource_name,
            secret_path=path_plan["full_path"],
        )
    
    # Use config in docker_compose or k8s_yaml
    docker_compose_env = config["docker_compose"]["environment"]
    
    # Apply to Tilt resource
    dc_resource(resource_name, env=docker_compose_env)

# Configure all services
for service in ["user", "order", "team"]:
    configure_resource_with_secrets(service)
"""

# =============================================================================
# 9. Validation Examples
# =============================================================================

def example_validation():
    """Example: Validate configurations."""
    
    # Validate path
    result = Infisical.Paths.validate_path("/services/my-service")
    print("Path Valid:", result["valid"])
    if not result["valid"]:
        print("Errors:", result["errors"])
    
    # Validate auth method
    auth_result = Infisical.Identity.validate_auth_method("universal-auth")
    print("Auth Method Valid:", auth_result["valid"])
    print("Auth Method Supported:", auth_result["supported"])
    
    # Validate machine config
    machine_config = Infisical.Identity.generate_universal_auth(
        identity_name="test-machine",
        access_paths=["/services/*"],
    )
    validation = Infisical.Identity.validate_machine_config(machine_config)
    print("Machine Config Valid:", validation["valid"])
    if validation["warnings"]:
        print("Warnings:", validation["warnings"])

# =============================================================================
# 10. Generating .env File Templates
# =============================================================================

def example_env_templates():
    """Example: Generate .env file templates."""
    
    # Generate for development
    machine = Infisical.Identity.generate_development_machine("dev-machine")
    env_content = Infisical.Identity.generate_env_file_content(
        machine,
        include_secrets=False,  # Don't include actual secrets
    )
    print("Dev .env template:")
    print(env_content[:500] + "...")
    
    # Generate service-specific template
    config = Infisical.Secrets.generate_for_service(
        "user-management-backend",
        "/services/user",
        "backend",
    )
    print("\nService local template:")
    print(config["local_template"][:500] + "...")

# =============================================================================
# Run all examples (in a real Tiltfile, you wouldn't do this)
# =============================================================================

# Uncomment to run examples:
# example_resource_secrets()
# example_path_planning()
# example_machine_identity()
# example_organization()
# example_batch_configuration()
# example_predefined_services()
# example_validation()
# example_env_templates()
