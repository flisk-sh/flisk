# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📄 ORCHESTRATOR APPLY - MANIFEST ORCHESTRATION
# =============================================================================

# === INLINED CONSTANTS for pure extension loading ===
BASE_PORT_FRONTEND = 3000
BASE_PORT_BACKEND = 4000
# === END INLINED CONSTANTS ===


load('../../../../../discovery/loading.star', 'Manifest')
load('./generators/manifest_resource.star', 'ManifestResource')



def prepare_resource_manifests(resource_config, ctx):
    resource_name = resource_config['name']
    resource_manifests = {}
    backend_manifest_cache = {}
    config_gen_resources = {}
    
    all_resources = resource_config.get('resources', [])

    # First pass: load all manifests.
    for resource in resource_config.get('resources', []):
        # Use the resource's _resource_path if available (for services from different scan roots)
        # Otherwise fall back to constructing path from resource_config path + resource name
        resource_path = resource.get('_resource_path', resource_config['path'] + '/' + resource['name'])

        # Load the manifest from the resource path
        manifest = Manifest.load_manifest(resource_path)
        resource_manifests[resource['name']] = manifest

        app_name = manifest.get('appName', resource['name'])
        stack = manifest.get('stack', resource_name)
        port = manifest.get('port', BASE_PORT_FRONTEND)
        app_type = manifest.get('appType', 'backend')

        print(
            "   [Tilt] ✅ Loaded: " + app_name
            + " | Stack: " + stack
            + " | Port: " + str(port)
            + " | Type: " + app_type
        )

        if manifest.get('appType') == 'backend':
            backend_manifest_cache[manifest.get('appName')] = manifest

    # Second pass: create config generation resources.
    for resource in resource_config.get('resources', []):
        manifest = resource_manifests.get(resource['name'], {})
        app_type = manifest.get('appType', 'backend')
        # infra services (verdaccio, etc.) are loaded by dedicated infra loaders —
        # do not generate golden app Dockerfiles/configs for them.
        if app_type in ['library', 'sdk', 'infra']:
            print("   [Tilt] ⏭  Skipping config-gen for {} (appType={})".format(resource['name'], app_type))
            continue

        backend_manifest = None

        if resource.get('frontend', False) or app_type == 'frontend':
            backend_name = manifest.get('backendName', resource['name'].replace('-frontend', '-backend'))
            backend_manifest = backend_manifest_cache.get(backend_name)
            if not backend_manifest:
                backend_manifest = Manifest.load_related(manifest)

        # Use the resource's actual service path for config generation
        resource_path = resource.get('_resource_path', resource_config['path'] + '/' + resource['name'])
        
        config_gen_resource = ManifestResource.create_config_resource(
            resource_name,
            resource,
            resource_path,  # Pass correct path instead of resource_config['path']
            manifest,
            backend_manifest,
            ctx,
        )
        config_gen_resources[resource['name']] = config_gen_resource

    return {
        'resource_manifests': resource_manifests,
        'config_gen_resources': config_gen_resources,
    }


ManifestOrchestration = struct(
    prepare = prepare_resource_manifests,
)
