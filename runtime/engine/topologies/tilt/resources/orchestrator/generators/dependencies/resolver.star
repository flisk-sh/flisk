# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔗 TILT SDK - DEPENDENCY RESOLUTION HELPERS
# =============================================================================
# Purpose: Resolve dependencies between services (frontend → backend lookups)
#          Auto-inject configuration from internal dependencies
# =============================================================================

load("../../../../../../../discovery/registry.star", "get_app_resources", "get_resource_by_name")
load("../../../../../platform/docker/networking/traefik_helpers.star", "cli_api_path")

def _find_backend_resource(resource_name):
    """Find a discovered resource by its own name, e.g. "api".

    Registry services are stacks (`app`) whose resources are the runnable pieces (`api`, `web`), so the lookup
    must search resources rather than service names. Frontends are skipped.
    """
    for service in get_app_resources():
        for resource in service.get("resources", []):
            if resource.get("name") != resource_name:
                continue
            app_type = resource.get("_manifest", {}).get("appType") or resource.get("appType")
            if app_type == "frontend":
                continue
            return resource
    return None


def _find_frontend_backend(manifest):
    """Find the backend a frontend talks to: `backendName` first, then the first API `dependsOn` entry.

    Returns:
        tuple: (backend resource name, backend manifest), or (None, None) when the frontend has no discovered backend
    """
    backend_name = manifest.get("backendName")
    if backend_name:
        backend = _find_backend_resource(backend_name)
        if backend:
            return backend_name, backend.get("_manifest", {})

    for dep_name in manifest.get("dependsOn", []):
        dep = _find_backend_resource(dep_name)
        if dep and dep.get("_manifest", {}).get("appType") in ["backend", "mcp", "agent"]:
            return dep_name, dep.get("_manifest", {})

    return None, None


def resolve_backend_api_path(manifest):
    """Resolve the URL path a frontend uses to reach its backend, e.g. "/api/api".

    The path is the backend's route on api.{project}.localhost: its explicit `apiPath` when set, otherwise
    `/api/{name}` with a trailing `-api` stripped, the same rule `flisk up` prints and Traefik serves.
    Frontends that have no discovered backend get None, so callers keep their stack-management fallback.

    Args:
        manifest: Frontend service manifest

    Returns:
        str: API path of the frontend's backend, or None if there is no backend
    """
    backend_name, backend_manifest = _find_frontend_backend(manifest)
    if backend_name == None:
        return None
    return cli_api_path(backend_name, backend_manifest)


def resolve_dependency_api_urls(manifest):
    """Resolve all API URLs from dependsOn.
    
    For each dependency in dependsOn, looks up the service
    and extracts its apiPath. Returns a dict mapping dependency names to URLs.
    
    Args:
        manifest: Service manifest with dependsOn
    
    Returns:
        dict: { dependency_name: api_url }
    """
    deps = manifest.get("dependsOn", [])
    if not deps:
        return {}
    
    urls = {}
    for dep_name in deps:
        dep_service = get_resource_by_name(dep_name)
        if not dep_service:
            continue
        
        # Find the backend resource for this dependency
        dep_resources = dep_service.get("resources", [])
        for resource in dep_resources:
            # Skip frontend resources, look for backend
            if resource.get("appType") == "frontend":
                continue
            
            dep_manifest = resource.get("_manifest", {})
            api_path = dep_manifest.get("apiPath")
            if api_path:
                urls[dep_name] = api_path
                break
    
    return urls


def get_backend_manifest(manifest):
    """Get the backend manifest referenced by a frontend manifest.
    
    Args:
        manifest: Frontend service manifest with backendName
    
    Returns:
        dict: Backend manifest or None if not found
    """
    backend_name = manifest.get("backendName")
    if not backend_name:
        return None
    
    backend_service = get_resource_by_name(backend_name)
    if not backend_service:
        return None
    
    backend_resources = backend_service.get("resources", [])
    for resource in backend_resources:
        if resource.get("name") == backend_name:
            return resource.get("_manifest", {})
    
    return None


def inject_dependency_env_vars(manifest, base_env_vars):
    """Inject environment variables from dependencies.
    
    For each internal dependency, adds VITE_{DEP}_API_URL to env vars.
    
    Args:
        manifest: Service manifest
        base_env_vars: Base environment variables dict
    
    Returns:
        dict: Updated environment variables with dependency URLs
    """
    env_vars = dict(base_env_vars)
    dep_urls = resolve_dependency_api_urls(manifest)
    
    for dep_name, api_path in dep_urls.items():
        # Convert dependency name to env var key
        # e.g., "identity-management-backend" -> "IDENTITY_MANAGEMENT_BACKEND_API_URL"
        env_key = dep_name.upper().replace("-", "_").replace(".", "_")
        env_vars["VITE_" + env_key + "_API_URL"] = api_path
    
    return env_vars


# Export struct for easy importing
DependencyResolvers = struct(
    resolve_backend_api_path = resolve_backend_api_path,
    resolve_dependency_api_urls = resolve_dependency_api_urls,
    get_backend_manifest = get_backend_manifest,
    inject_dependency_env_vars = inject_dependency_env_vars,
)
