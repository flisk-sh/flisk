# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📈 INCREMENTAL DISCOVERY - Register New Services Dynamically
# =============================================================================
# Handles registration of newly detected services without full Tilt restart
# =============================================================================

load("./registry.star", "CacheOps", "get_app_resources")
load("./discovery_orchestrator.star", "normalize_manifest")
load("../resources/orchestrator/generators/manifest_resource.star", "ManifestResource")
load("../../engine/topologies/tilt/manifest/loader.star", "ManifestLoader")
load("../../specs/specs/TILT_RESOURCE_DEFAULTS.star", "BASE_PORT_BACKEND")

def register_new_resource(resource_path, manifest, ctx, auto_init=True, verbose=False):
    """
    Register a newly discovered resource and create its Tilt resources.
    
    Args:
        resource_path: Path to resource directory
        manifest: Loaded manifest dict
        ctx: Tilt context with generators and config
        auto_init: Whether to auto-init resources
        verbose: Enable verbose logging
    
    Returns:
        Struct with success status and created resources
    """
    resource_name = manifest.get("appName", "")
    app_type = manifest.get("appType", "backend")
    stack = manifest.get("stack", "")
    
    if verbose:
        print("🚀 Registering new resource: {}".format(resource_name))
    
    # Normalize manifest to discovery format
    resource = normalize_manifest(manifest, resource_path)
    
    # Build app resource structure
    app_resource_dict = {
        "name": resource_name,
        "path": resource_path,
        "labels": ["app." + resource_name],
        "resources": [resource],
    }
    
    # Add to cache
    if not CacheOps.add(app_resource_dict):
        print("⚠️  Failed to add {} to cache (may already exist)".format(resource_name))
        return struct(success=False, error="cache_add_failed")
    
    # Create Tilt resources
    created_resources = []
    
    # Create config-gen resource
    config_gen_name = _create_config_gen_resource(
        resource_name,
        resource,
        resource_path,
        manifest,
        ctx,
        auto_init
    )
    created_resources.append(config_gen_name)
    
    # Create Docker build resource
    docker_resource = _create_docker_resource(
        resource_name,
        resource,
        resource_path,
        manifest,
        ctx
    )
    if docker_resource:
        created_resources.append(docker_resource)
    
    # Create additional resources based on app type
    if app_type == "frontend":
        frontend_resources = _create_frontend_resources(
            resource_name,
            resource,
            resource_path,
            manifest,
            ctx,
            auto_init
        )
        created_resources.extend(frontend_resources)
    
    # Log success
    print("✅ Auto-registered: {}".format(resource_name))
    print("  └─ Stack: {}".format(stack))
    print("  └─ Type: {}".format(app_type))
    print("  └─ Resources: {} created".format(len(created_resources)))
    
    return struct(
        success=True,
        resource_name=resource_name,
        resources=created_resources,
        count=len(created_resources)
    )

def _create_config_gen_resource(resource_name, resource, resource_path, manifest, ctx, auto_init):
    """Create config-gen resource for a resource."""
    # Get backend manifest if frontend
    backend_manifest = None
    if resource.get("frontend", False):
        backend_name = resource.get("backendName", resource_name.replace("-frontend", "-backend"))
        backend_manifest = _get_backend_manifest(backend_name)
    
    # Use ManifestResource to create config-gen
    resource_config = {
        "name": resource.get("name", resource_name),
        "port": resource.get("port", BASE_PORT_BACKEND),
        "_manifest": manifest,
    }
    
    config_gen_name = ManifestResource.create_config_resource(
        resource_name,
        resource_config,
        resource_path,
        manifest,
        backend_manifest,
        ctx
    )
    
    return config_gen_name

def _create_docker_resource(resource_name, resource, resource_path, manifest, ctx):
    """Create Docker build resource for a resource."""
    # Docker resource is created through the orchestrator
    # This is handled when the config-gen resource runs
    # Return the expected resource name for tracking
    return resource_name

def _create_frontend_resources(resource_name, resource, resource_path, manifest, ctx, auto_init):
    """Create additional resources for frontend app resources."""
    resources = []
    
    # Frontend dev server resource is auto-created by the orchestrator
    # when processing the manifest
    
    return resources

def _get_backend_manifest(backend_name):
    """Look up backend manifest for a frontend app resource."""
    # Search in current cache
    for app_resource in get_app_resources():
        if app_resource.get("name") == backend_name:
            resources = app_resource.get("resources", [])
            for res in resources:
                if res.get("_manifest"):
                    return res.get("_manifest")
    return None

def validate_resource_structure(resource_path):
    """
    Validate that an app resource has complete structure before registration.
    
    Args:
        resource_path: Path to app resource directory
    
    Returns:
        Struct with valid status and missing files
    """
    required_files = ["service.json", "package.json"]
    missing = []
    
    for filename in required_files:
        filepath = resource_path + "/" + filename
        result = local(
            ["sh", "-c", 'test -f "$1" && echo yes || echo no', "sh", filepath],
            quiet=True,
            echo_off=True
        )
        if str(result).strip() != "yes":
            missing.append(filename)
    
    return struct(
        valid=len(missing) == 0,
        missing=missing,
        has_resource_json="service.json" not in missing,
        has_package_json="package.json" not in missing
    )

def check_duplicate_resource(resource_name):
    """
    Check if a resource name already exists.
    
    Args:
        resource_name: Name to check
    
    Returns:
        Struct with duplicate status and existing info
    """
    if CacheOps.has(resource_name):
        # Find existing resource path
        for app_resource in get_app_resources():
            if app_resource.get("name") == resource_name:
                return struct(
                    duplicate=True,
                    existing_path=app_resource.get("path", "unknown"),
                    message="Resource '{}' already exists at {}".format(
                        resource_name,
                        app_resource.get("path", "unknown")
                    )
                )
    
    return struct(duplicate=False)

# Export public API
IncrementalDiscovery = struct(
    register=register_new_resource,
    validate_structure=validate_resource_structure,
    check_duplicate=check_duplicate_resource,
)
