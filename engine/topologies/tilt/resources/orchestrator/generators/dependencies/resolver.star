# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔗 TILT SDK - DEPENDENCY RESOLUTION HELPERS
# =============================================================================
# Purpose: Resolve dependencies between services (frontend → backend lookups)
#          Auto-inject configuration from internal dependencies
# =============================================================================

load("../../../../../../../discovery/registry.star", "get_resource_by_name")

def resolve_backend_api_path(manifest):
    """Resolve API path from backend manifest if backendName is specified.
    
    Frontend manifests often reference a backend via backendName.
    This function looks up the backend's apiPath for consistency.
    
    Args:
        manifest: Frontend service manifest
    
    Returns:
        str: API path from backend manifest, or None if not found
    """
    backend_name = manifest.get("backendName")
    if not backend_name:
        return None
    
    # Try to find the backend service
    backend_service = get_resource_by_name(backend_name)
    if not backend_service:
        return None
    
    # Get the backend manifest
    backend_resources = backend_service.get("resources", [])
    for resource in backend_resources:
        if resource.get("name") == backend_name:
            backend_manifest = resource.get("_manifest", {})
            return backend_manifest.get("apiPath")
    
    return None


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
