# AGENTS.md - Tilt Resources

## Purpose

Define and create Tilt resources (docker_build, local_resource, k8s_resource) for services.

## Key Files

### Main Resource Builders
- **`libs.star`** - Library resource creation
- **`dbs.star`** - Database resource creation
- **`infra.star`** - Infrastructure resource creation (Postgres, Redis, Verdaccio)
- **`orchestrator.star`** - Main orchestrator, ties everything together

### Resource Types
- **`docker/`** - Docker-specific resource logic
- **`local/`** - Local command resources

### Generators Subfolder
- **`orchestrator/generators/manifest_resource.star`** - Creates per-manifest resources
- **`orchestrator/generators/domain_resource.star`** - Creates per-domain resources

## Common Tasks

### Create library resource
```starlark
load("./libs.star", "create_lib_resources")
lib_resources = create_lib_resources(ctx, library_map)
```

### Create database resource
```starlark
load("./dbs.star", "create_db_resources")
db_resources = create_db_resources(ctx, resource_name, db_name)
```

### Full orchestration
```starlark
load("./orchestrator.star", "Orchestrator")
Orchestrator.orchestrate_all(ctx, app_resources, options)
```

## Resource Chain

```
1. Config Generation (config-gen)
   ↓
2. Library Resources (lib-*)
   ↓
3. Database Resources (db-*)
   ↓
4. Service Resources (docker_build)
   ↓
5. YAML Resources (local_resource for k8s)
```

## Integration

- Called by main `Tiltfile`
- Uses `discovery/registry.star` to get service list
- Creates the actual Tilt UI resources you see

## Key Functions

- `docker_build()` - Build service images
- `local_resource()` - Config generation, YAML loading
- `k8s_resource()` - Kubernetes deployments

## Important

Each manifest gets its own Tilt resource visible in the UI.
