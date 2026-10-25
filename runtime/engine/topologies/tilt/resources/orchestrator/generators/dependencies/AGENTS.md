# AGENTS.md - Dependency Resolution Module

## Purpose

Centralized dependency resolution for Tilt SDK generators. Auto-discovers and injects configuration from internal dependencies.

## Key Functions

### `resolve_backend_api_path(manifest)`
Resolves API path from backend manifest when frontend has `backendName`.

```python
# Frontend manifest: { "backendName": "identity-management-backend" }
api_path = resolve_backend_api_path(manifest)
# Returns: "/api/v1/identity-management" (from backend manifest)
```

### `resolve_dependency_api_urls(manifest)`
Resolves all API URLs from `dependsOn`.

```python
# Manifest: { "dependsOn": ["identity", "user"] }
urls = resolve_dependency_api_urls(manifest)
# Returns: { "identity": "/api/v1/identities", "user": "/api/v1/users" }
```

### `get_backend_manifest(manifest)`
Gets full backend manifest by `backendName`.

```python
backend_manifest = get_backend_manifest(manifest)
# Returns: Full backend manifest dict
```

### `inject_dependency_env_vars(manifest, base_env_vars)`
Auto-injects VITE_*_API_URL environment variables for all dependencies.

```python
env_vars = inject_dependency_env_vars(manifest, {"PORT": 3000})
# Returns: { "PORT": 3000, "VITE_IDENTITY_API_URL": "/api/v1/identities" }
```

## Usage

```python
load("./dependencies/resolver.star", "resolve_backend_api_path")

def generate_something(manifest):
    # Auto-resolve backend API path
    api_path = resolve_backend_api_path(manifest)
    if api_path:
        # Use backend's apiPath
        pass
```

## Architecture

```
manifest (with backendName)
    ↓
resolve_backend_api_path()
    ↓
registry.get_resource_by_name(backend_name)
    ↓
backend_service.resources[]
    ↓
backend_manifest.apiPath
```

## Future Extensions

- Add caching for resolved dependencies
- Add version compatibility checking
- Add circular dependency detection
- Support multiple backend references
