# 🔐 Infisical Starlark Generators - Complete Documentation

## Overview

The Infisical Starlark generators provide a complete, programmatic way to manage secret injection in the Flisk CLI. This replaces shell-based configuration with type-safe Starlark code.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    INFISICAL GENERATORS                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. SECRETS GENERATOR (secrets_generator.star)                  │
│     ├── generate_for_service() - Service secret config         │
│     ├── generate_docker_compose_env() - Docker Compose env   │
│     ├── generate_entrypoint_env() - Entrypoint configuration │
│     └── generate_local_env_template() - Local dev .env       │
│                                                                 │
│  2. PATH MANAGER (path_manager.star)                            │
│     ├── plan_resource_path() - Plan Infisical path              │
│     ├── validate_path() - Path validation                      │
│     ├── known_paths - 14 predefined service paths              │
│     └── ROOT_PATHS, PLATFORM_PATHS - Path constants            │
│                                                                 │
│  3. MACHINE IDENTITY (machine_identity.star)                    │
│     ├── generate_universal_auth() - Client ID/Secret auth    │
│     ├── generate_development_machine() - Dev machine config  │
│     ├── generate_ci_machine() - CI/CD machine config         │
│     └── AUTH_METHODS - All supported auth methods              │
│                                                                 │
│  4. ORGANIZATION (organization.star)                            │
│     ├── generate_config() - Complete org setup                 │
│     ├── ENVIRONMENTS - dev, staging, prod configs              │
│     ├── ROLES - Admin, developer, readonly, etc.             │
│     └── SECRET_TEMPLATES - DATABASE_URL, JWT_SECRET, etc.      │
│                                                                 │
│  5. DOCKER INTEGRATION (infisical_docker.star)                │
│     ├── runtime_setup() - L4 runtime secret injection          │
│     ├── builder_setup() - L3 builder CLI setup                 │
│     └── generate_compose_env() - Docker Compose environment  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Load the Modules

```starlark
# Option 1: Load complete Infisical module
load("engine/topologies/tilt/generators/infisical/index.star", "Infisical")

# Option 2: Load from generators index (recommended)
load("engine/topologies/tilt/generators/index.star", "Generators")
Infisical = Generators.SecretsManagement

# Option 3: Load from security module (full integration)
load("engine/topologies/platform/security/secrets.star", "Secrets")
```

### 2. Configure Service Secrets

```starlark
# Generate complete configuration for a service
config = Infisical.Secrets.generate_for_service(
    resource_name="user-management-backend",
    secret_path="/services/user",
    resource_type="backend",
    command="bun run src/index.ts",
)

# Access generated configuration
print(config["resource_name"])        # "user-management-backend"
print(config["secret_path"])         # "/services/user"
print(config["required_secrets"])    # ["DATABASE_URL", "JWT_SECRET", "RESOURCE_API_KEY"]
print(config["docker_compose"]["environment"])
```

### 3. Use in Dockerfile Generation

```starlark
# In L4 runtime layer generation
load("engine/topologies/platform/docker/layers/infisical/index.star", "InfisicalLayers")

def generate_backend_runtime(resource_name, cmd="bun run start"):
    parts = []
    
    # ... other Dockerfile setup ...
    
    # Use InfisicalDocker for runtime secret injection
    infisical_setup = InfisicalLayers.Docker.runtime_setup(
        resource_name=resource_name,
        resource_type="backend",
        command=cmd,
        use_entrypoint=True,
    )
    parts.append(infisical_setup)
    
    return "".join(parts)
```

### 4. Use in Docker Compose

```starlark
# Generate environment variables for docker-compose
env = Infisical.Docker.generate_compose_env(
    resource_name="user-management-backend",
    resource_type="backend",
)

# Use in dc_resource
dc_resource("user-management-backend", env=env)
```

## Detailed API Reference

### Secrets Generator

#### `generate_for_service(resource_name, secret_path, resource_type, command, additional_vars)`

Generates complete secret configuration for a service.

**Parameters:**
- `resource_name` (str): Name of the service (e.g., "user-management-backend")
- `secret_path` (str): Infisical path (e.g., "/services/user")
- `resource_type` (str): Type of service (backend, frontend, payment, notification)
- `command` (str): Command to run after secret injection (optional)
- `additional_vars` (dict): Additional environment variables (optional)

**Returns:**
```starlark
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
```

#### `generate_for_services_batch(services_config)`

Batch configuration for multiple services.

```starlark
services = [
    {"name": "user", "path": "/services/user", "type": "backend"},
    {"name": "payment", "path": "/services/payment", "type": "payment"},
]
configs = Infisical.Secrets.generate_for_services_batch(services)
```

### Path Manager

#### `plan_resource_path(resource_name, resource_type, parent_path)`

Plans the Infisical path for a service.

```starlark
plan = Infisical.Paths.plan_resource_path(
    resource_name="user-management-backend",
    resource_type="backend",
)

# Returns:
# {
#     "resource_name": "user-management-backend",
#     "resource_type": "backend",
#     "parent_path": "/services",
#     "resource_folder": "user",
#     "full_path": "/services/user",
#     "validation": {"valid": True, "errors": [], "warnings": []},
#     "subpaths": ["/services/user/database", ...],
# }
```

#### Predefined Service Paths

14 services have predefined paths:

```starlark
# Access all known paths
print(Infisical.Paths.known_paths)

# Get specific service path
path = Infisical.Paths.get_known_resource_path("user-management-backend")
# Returns: "/services/user"
```

| Service | Path |
|---------|------|
| user-management-backend | /services/user |
| order-management-backend | /services/order |
| order-planner-backend | /services/order-planner |
| staff-management-backend | /services/staff |
| treatment-management-backend | /services/treatment |
| inventory-management-backend | /services/inventory |
| website-management-backend | /services/website |
| gdpr-compliance-backend | /services/gdpr |
| payment-management-backend | /services/payment |
| payment-processing-backend | /services/billing |
| api-gateway | /services/api-gateway |
| api-gateway-test | /services/api-gateway-test |
| orchestrator-glue-backend | /services/orchestrator-glue |

### Machine Identity

#### `generate_universal_auth(identity_name, access_paths, project_id, environment)`

Generates Universal Auth (Client ID + Client Secret) configuration.

```starlark
config = Infisical.Identity.generate_universal_auth(
    identity_name="dev-machine",
    access_paths=["/services/*", "/platform/*"],
    project_id="bc7cf07f-4002-4148-bca8-78a05c95dea2",
    environment="dev",
)
```

#### Predefined Machine Templates

```starlark
# Development machine (broad access)
dev_machine = Infisical.Identity.generate_development_machine("dev-machine")

# CI/CD machine (for GitHub Actions)
ci_machine = Infisical.Identity.generate_ci_machine("github-actions")

# Service-specific machine (restricted access)
resource_machine = Infisical.Identity.generate_resource_specific_machine("user")
```

### Organization

#### `generate_config(org_name, env_names, resource_names)`

Generates complete organization configuration.

```starlark
org = Infisical.Org.generate_config(
    org_name="{project}",
    env_names=["dev", "staging", "prod"],
    resource_names=["user", "order", "payment"],
)

# Returns complete setup including:
# - Organization metadata
# - Project configuration
# - Environments
# - Roles
# - Folder structure
# - Secret templates
```

## Migration from Shell Scripts

### Before (Shell-based)

```dockerfile
# Hardcoded in Dockerfile generation
COPY --chmod=0755 shared-platform-engineering/docker-templates/infisical-entrypoint.sh /entrypoint.sh
ENV RESOURCE_NAME=my-service
ENV INFISICAL_SECRET_PATH=/services/my-service
ENTRYPOINT ["/entrypoint.sh"]
CMD ["bun", "run", "start"]
```

### After (Starlark generators)

```starlark
# In your Tiltfile or .star file
load("engine/topologies/platform/docker/layers/infisical/index.star", "InfisicalLayers")

# Generate Dockerfile snippet dynamically
infisical_setup = InfisicalLayers.Docker.runtime_setup(
    resource_name="my-service",
    secret_path="/services/my-service",  # Auto-generated if not provided
    resource_type="backend",
    command="bun run start",
)

# Returns:
# COPY --chmod=0755 shared-platform-engineering/docker-templates/infisical-entrypoint.sh /entrypoint.sh
# ENV RESOURCE_NAME=my-service
# ENV INFISICAL_SECRET_PATH=/services/my-service
# ENV INFISICAL_TOKEN=${INFISICAL_TOKEN:-}
# ... (all env vars from generator)
# ENTRYPOINT ["/entrypoint.sh"]
# CMD ["bun", "run", "start"]
```

## Usage in Tiltfile

### Complete Example

```starlark
# Load modules
load("engine/topologies/platform/security/secrets.star", "Secrets")
load("engine/topologies/tilt/generators/infisical/index.star", "Infisical")

# Define services to configure
services = [
    "user-management-backend",
    "order-management-backend",
    "payment-management-backend",
]

# Configure all services
for service in services:
    # Get predefined configuration
    config = Secrets.configure_predefined_service(service)
    
    if config:
        # Use in docker_compose
        docker_compose("services/{}/docker-compose.yml".format(service))
        dc_resource(
            service,
            env=config["docker_compose"]["environment"],
            labels=["backend"],
        )

# Or configure all at once
all_configs = Secrets.configure_all_predefined_services()
```

## Testing

### Validate Paths

```starlark
# Validate a custom path
result = Infisical.Paths.validate_path("/services/my-service")
print(result["valid"])      # True/False
print(result["errors"])     # [] or [error messages]
print(result["normalized"]) # Normalized path
```

### Validate Machine Identity

```starlark
# Check auth method
result = Infisical.Identity.validate_auth_method("universal-auth")
print(result["valid"])      # True
print(result["supported"])  # True
print(result["deprecated"]) # False
```

## File Structure

```
tdk-cli/engine/topologies/
├── tilt/generators/infisical/
│   ├── index.star              # Master module export
│   ├── secrets_generator.star  # Secret injection config
│   ├── path_manager.star       # Path/folder management
│   ├── machine_identity.star   # Machine ID configuration
│   ├── organization.star       # Org setup templates
│   └── examples.star           # Usage examples
│
└── platform/docker/layers/infisical/
    ├── index.star              # Docker layers index
    └── infisical_docker.star   # Dockerfile generation
```

## Best Practices

1. **Use Predefined Services**: When possible, use `Secrets.PREDEFINED_RESOURCES` instead of manual configuration.

2. **Validate Early**: Always validate paths and configurations before using them:
   ```starlark
   validation = Infisical.Paths.validate_path(path)
   if not validation["valid"]:
       fail("Invalid path: " + str(validation["errors"]))
   ```

3. **Don't Hardcode Secrets**: Always use generators for secret paths and never hardcode secret values.

4. **Batch Configuration**: Use `generate_for_services_batch()` when configuring multiple services.

5. **Environment Separation**: Use different configurations for dev/staging/prod:
   ```starlark
   if environment == "prod":
       config = Infisical.Identity.generate_production_machine(...)
   else:
       config = Infisical.Identity.generate_development_machine(...)
   ```

## Troubleshooting

### Path Validation Failures

```starlark
result = Infisical.Paths.validate_path("/invalid/path with spaces")
# Returns: {"valid": False, "errors": ["Invalid characters: [' ']"]}
```

Fix: Use the path normalizer
```starlark
normalized = Infisical.Paths.normalize_path("/invalid/path with spaces")
# Returns: "/invalid/path-with-spaces"
```

### Unknown Service

```starlark
path = Infisical.Paths.get_known_resource_path("unknown-service")
# Returns: None

# Solution: Plan a new path
plan = Infisical.Paths.plan_resource_path("unknown-service")
path = plan["full_path"]  # "/services/unknown-service"
```

## See Also

- `examples.star` - Complete usage examples
- `SECRETS_SETUP_COMPLETE.md` - Infisical setup documentation
- `MACHINE_IDENTITY.md` - Machine identity setup guide
