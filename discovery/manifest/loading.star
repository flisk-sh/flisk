# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📋 TILT SDK - MANIFEST LOADING (CEO Review: rename-service-manifest)
# =============================================================================
# Path: .tilt/topologies/tilt/discovery/manifest/loading.star
# Purpose: Load, synthesize, and apply defaults to manifests
# 
# Manifest loading with synthesis-by-default
# Priority: service.json → synthesize from path
# =============================================================================

load('../../engine/topologies/tilt/manifest/parser.star', 'generated_string_error')
load('../../engine/topologies/tilt/manifest/constants.star',
     'MANIFEST_DEFAULTS',
     'DEFAULT_SYNCS',
     'MANIFEST_FILENAME',
     'BASE_PORT_FRONTEND',
     'BASE_PORT_BACKEND',
     'HEALTH_CHECK_PATH')
load('../../engine/topologies/tilt/common/utils.star', 'Utils')
load('../../engine/topologies/platform/docker/constants.star', 'PlatformDockerConstants')

def _check_prisma_folder(resource_path):
    """
    Check if prisma/ directory exists in resource path (silent).
    Used to auto-detect has_migrator when not in features.
    """
    check_cmd = "test -d '{path}/prisma' && echo 'yes' || echo 'no'".format(path=resource_path)
    result = str(local(check_cmd, quiet=True, echo_off=True)).strip()
    return result == 'yes'


def check_prisma_folder(resource_path):
    return _check_prisma_folder(resource_path)


def get_default_syncs_for_type(app_type, features=None):
    """
    Returns default sync paths based on app type and features.
    """
    if features == None:
        features = []

    syncs = list(DEFAULT_SYNCS.get(app_type, [] if app_type == 'bring-your-own' else ['src', 'package.json']))

    # Add prisma to syncs if using prisma feature
    if app_type == 'backend' and 'prisma' in features and 'prisma' not in syncs:
        syncs.append('prisma')

    return syncs


def _extract_stack_from_path(resource_path, app_name):
    """
    Extract stack from resource path or app name.
    
    Convention: services/product/{stack}/{resource-name}
    Fallback: First segment of app_name before hyphen
    
    Special handling: profile -> identity
    """
    parts = resource_path.rstrip('/').split('/')
    if len(parts) >= 4 and parts[-4] == 'services' and parts[-3] == 'product':
        stack = parts[-2]
        # Normalize profile to identity
        if stack == 'profile':
            return 'identity'
        return stack
    else:
        return app_name.split('-')[0] if '-' in app_name else app_name


def load_manifest(resource_path, persist_to_disk=False):
    """
    Load manifest with synthesis-by-default.
    
    Priority order:
      1. service.json (manifest file)
      2. Synthesize from directory structure (synthesis-by-default for standard resources)
    
    Args:
        resource_path: Path to resource directory
        persist_to_disk: If True, sync _internalDeps back to the physical manifest file
        
    Returns:
        Validated manifest dict with all defaults applied
    """
    manifest = None
    manifest_source = None
    manifest_path = None
    
    # Prepend project root to relative paths for correct resolution
    project_root = os.environ.get('TDK_PROJECT_ROOT', '')
    if project_root and not resource_path.startswith('/'):
        base_path = project_root + '/' + resource_path
    else:
        base_path = resource_path
    
    # Try to load manifest file
    manifest_full_path = base_path + '/' + MANIFEST_FILENAME
    content = read_file(manifest_full_path, default='')
    
    if content and str(content).strip():
        manifest = decode_json(content)
        # Refuse service.json values that would add keys to generated config (GHSA-phgf-pww4-7jxc)
        unsafe_field_error = generated_string_error(manifest, manifest_full_path) if type(manifest) == "dict" else None
        if unsafe_field_error:
            fail(unsafe_field_error)
        manifest_source = 'service.json'
        manifest_path = manifest_full_path
    else:
        # Synthesize from directory structure if no manifest found
        manifest = synthesize_manifest_from_path(resource_path)
        manifest_source = 'synthesized'
        manifest_path = resource_path  # Virtual path
    
    # Validate JSON parsed correctly
    if manifest == None and manifest_source != 'synthesized':
        fail("""
❌ ═══════════════════════════════════════════════════════════════════
❌  INVALID JSON IN MANIFEST FILE
❌ ═══════════════════════════════════════════════════════════════════
   📁 File: {path}
   Source: {source}
   
   Common issues:
   • Missing closing quote: "appName": "my-app
   • Trailing comma: "port": 4000,}}
   • Missing comma between properties
   • Single quotes instead of double quotes
   
   Fix the JSON syntax and run 'tilt up' again.
❌ ═══════════════════════════════════════════════════════════════════
""".format(path=manifest_path, source=manifest_source))
    
    # Track manifest source for debugging
    manifest['_manifestSource'] = manifest_source
    manifest['_manifestPath'] = manifest_path
    
    # Apply defaults and compute derived values
    validated = apply_manifest_defaults(manifest, resource_path)

    return validated


def synthesize_manifest_from_path(resource_path):
    return _synthesize_manifest_from_path(resource_path)


def apply_manifest_defaults(manifest, resource_path):
    return _apply_manifest_defaults(manifest, resource_path)


def _synthesize_manifest_from_path(resource_path):
    """
    Create a manifest based on directory naming conventions.
    Used when manifest.json doesn't exist (backward compatibility).
    
    Convention: services/product/{stack}/{stack}-{component}-{type}
    Example: services/product/{stack}/{app-name}-{type}
             -> appName: {app-name}-{type}
             -> appType: {type}
             -> stack: {stack}
    """
    parts = resource_path.rstrip('/').split('/')
    dir_name = parts[-1] if parts else 'unknown-service'
    
    # Determine appType from directory name suffix
    app_type = 'backend'
    if dir_name.endswith('-frontend'):
        app_type = 'frontend'
    elif dir_name.endswith('-backend'):
        app_type = 'backend'
    elif dir_name.endswith('-migrator'):
        app_type = 'migrator'
    elif dir_name.endswith('-sdk'):
        app_type = 'sdk'
    elif dir_name.endswith('-infra') or dir_name.endswith('-ui'):
        app_type = 'library'
    elif 'lib-' in dir_name or 'platform-' in dir_name:
        app_type = 'library'
    
    return {
        'appName': dir_name,
        'appType': app_type,
        '_synthesized': True,
    }


def _apply_manifest_defaults(manifest, resource_path):
    """
    🎯 SMART DEFAULTS: Expand slim manifest to full config.
    
    CEO Review updates (rename-service-manifest):
    - Port is constant per appType (3000 frontend, 4000 backend) — Traefik handles routing
    - Custom dockerfile support via manifest["dockerfile"] field
    - Developer manually provides features (no auto-detection per requirement)
    
    Convention over Configuration:
    - features: ["nats", "prisma"] -> usePrisma=True, useNats=True
    - domain: "order" -> databaseName="TDK_order"
    - domain: "order" -> traefik.host="order.backend.{project}.local"
    - domain: "order" -> nats.queueGroup="order_backend_svc"
    """
    result = dict(manifest)

    # Normalize resource_path to be relative (strip leading / if present)
    # Docker build context requires relative paths
    if resource_path.startswith('/'):
        resource_path = resource_path[1:]

    # Track overrides for logging (task 4.8: override detection)
    overrides = []
    app_name = result.get('appName', '')
    
    # Apply simple defaults
    for key, default_value in MANIFEST_DEFAULTS.items():
        if key not in result or result[key] == None:
            result[key] = default_value

    # A bring-your-own service may not speak HTTP, so only an explicit healthCheckPath gives it one. compose.star and
    # l4_runtime_layers.star read a missing path as "no HTTP probe"; the default above would otherwise hide that.
    # (ManifestParser.normalize applies the same rule, but `tdk up` does not load manifests through it.)
    if result.get('appType') == 'bring-your-own' and not manifest.get('healthCheckPath'):
        result.pop('healthCheckPath', None)

    # 🎯 CEO REVIEW: Traefik-native port strategy
    # Port is constant per appType, not dynamically assigned
    # Traefik routes by hostname (e.g., booking.backend.{project}.local), not port
    app_type = result.get('appType', 'backend')
    
    # Set constant port per appType, but preserve explicit service.json ports.
    computed_port = None
    if app_type == 'frontend':
        computed_port = BASE_PORT_FRONTEND
    elif app_type == 'backend':
        computed_port = BASE_PORT_BACKEND
    elif app_type == 'migrator':
        computed_port = 7000  # Migrator uses different range
    
    if computed_port != None and ('port' not in manifest or manifest.get('port') == None):
        result['port'] = computed_port
    
    # 🎯 CEO REVIEW: Custom dockerfile support
    # Validate custom dockerfile exists if specified
    if 'dockerfile' in result:
        custom_dockerfile = result['dockerfile']
        # With a bring-your-own buildContext the dockerfile is relative to that context.
        build_context = result.get('buildContext')
        if build_context and build_context != '.':
            dockerfile_path = resource_path + '/' + build_context + '/' + custom_dockerfile
        else:
            dockerfile_path = resource_path + '/' + custom_dockerfile
        # BUG FIX: Run check from project root since Tilt may run from .tdk/.tdk-out/
        project_root = os.environ.get('TDK_PROJECT_ROOT', '')
        if project_root:
            dockerfile_exists = local("cd '{root}' && test -f '{path}' && echo 'yes' || echo 'no'".format(root=project_root, path=dockerfile_path), quiet=True, echo_off=True)
        else:
            dockerfile_exists = local("test -f '{path}' && echo 'yes' || echo 'no'".format(path=dockerfile_path), quiet=True, echo_off=True)
        if str(dockerfile_exists).strip() != 'yes':
            fail("""
❌ ═══════════════════════════════════════════════════════════════════
❌  CUSTOM DOCKERFILE NOT FOUND
❌ ═══════════════════════════════════════════════════════════════════
   📁 Resource: {resource}
   🐳 Dockerfile: {dockerfile}
   
   Manifest specifies custom Dockerfile but it doesn't exist.
   Either:
    • Create {dockerfile} in resource directory
   • Remove "dockerfile" field to use auto-generated Dockerfile
❌ ═══════════════════════════════════════════════════════════════════
""".format(resource=resource_path.split('/')[-1], dockerfile=custom_dockerfile))
    
    # 🎯 FEATURE FLAGS -> BOOLEAN CONFIG
    # NOTE: Developer manually provides features per CEO Review requirement
    # No auto-detection from file existence (e.g., prisma/schema.prisma)
    features = result.get('featuresEnabled', [])
    result['usePrisma'] = 'prisma' in features
    result['useNats'] = 'nats' in features
    result['useTraefik'] = (
        'traefik' in features
        or app_type in ['backend', 'sdk']
        or (app_type == 'bring-your-own' and result.get('exposeViaProxy', True))
    )

    # Extract stack from path if not set
    if 'stack' not in result:
        result['stack'] = _extract_stack_from_path(resource_path, app_name)
    
    stack = result['stack']
    
    # 🎯 SMART DATABASE NAME with override detection
    computed_db_name = PlatformDockerConstants.get_db_name(stack)
    if 'databaseName' not in result:
        result['databaseName'] = computed_db_name
    elif result['databaseName'] != computed_db_name:
        overrides.append("databaseName: {} (auto: {})".format(result['databaseName'], computed_db_name))
    
    # 🎯 SMART TRAEFIK CONFIG (Convention over Configuration)
    # Apply to backends and SDKs that need Traefik routing
    if result['useTraefik'] and app_type in ['backend', 'sdk', 'bring-your-own']:
        existing_traefik = result.get('traefik', {})
        # Use apiPath from root level if available, otherwise use default pattern
        root_api_path = result.get('apiPath')
        default_path_prefix = root_api_path if root_api_path else '/api/' + stack
        
        # A bring-your-own service without healthCheckPath may not serve HTTP, so it gets no default Traefik health path.
        default_health_path = None if app_type == 'bring-your-own' else HEALTH_CHECK_PATH
        computed_traefik = {
            'host': stack + '.backend.' + PlatformDockerConstants.PROJECT_NAME + '.local',
            'pathPrefix': default_path_prefix,
            # Follows healthCheckPath so a manifest that only sets that keeps one
            # path for both probes; `traefik.healthCheck` overrides just Traefik's.
            'healthCheck': result.get('healthCheckPath') or default_health_path,
        }
        
        # Check for overrides
        if existing_traefik.get('host') and existing_traefik.get('host') != computed_traefik['host']:
            overrides.append("traefik.host: {} (auto: {})".format(existing_traefik['host'], computed_traefik['host']))
        if existing_traefik.get('pathPrefix') and existing_traefik.get('pathPrefix') != computed_traefik['pathPrefix']:
            overrides.append("traefik.pathPrefix: {} (auto: {})".format(existing_traefik['pathPrefix'], computed_traefik['pathPrefix']))
        
        result['traefik'] = {
            'host': existing_traefik.get('host', computed_traefik['host']),
            'pathPrefix': existing_traefik.get('pathPrefix', computed_traefik['pathPrefix']),
            'healthCheck': existing_traefik.get('healthCheck', computed_traefik['healthCheck']),
        }
        if result['traefik']['healthCheck'] == None:
            result['traefik'].pop('healthCheck')
    
    # 🎯 SMART NATS CONFIG
    if result['useNats']:
        existing_nats = result.get('nats', {})
        result['nats'] = {
            'queueGroup': existing_nats.get('queueGroup', stack + '_' + app_type + '_svc'),
            'subjects': existing_nats.get('subjects', [stack + '.>']),
        }
    
    # Compute backend name for frontends with override detection
    if app_type == 'frontend':
        computed_backend = app_name.replace('-frontend', '-backend')
        if 'backendName' not in result:
            result['backendName'] = computed_backend
        elif result['backendName'] != computed_backend:
            overrides.append("backendName: {} (auto: {})".format(result['backendName'], computed_backend))
        
        # 🎯 SMART BASEPATH for frontends (convention: /{appName})
        # Was '/' + stack + 's', which appended a second 's' to an already-plural
        # stack ("operations" -> /operationss) and collided whenever one stack had
        # two frontends. The service name is unique and matches the URL `tdk up`
        # prints, so what the CLI advertises is what Traefik actually serves.
        computed_base_path = '/' + app_name
        if 'basePath' not in result:
            result['basePath'] = computed_base_path
        elif result['basePath'] != computed_base_path:
            overrides.append("basePath: {} (auto: {})".format(result['basePath'], computed_base_path))
    
    # 🎯 Always set _servicePath for all manifest types
    result['_servicePath'] = resource_path
    
    # 🎯 CENTRALIZED: Use Utils.get_internal_deps() for dependency extraction
    internal_deps = Utils.get_internal_deps(resource_path)
    result['_internalDeps'] = sorted(internal_deps)
    
    # 🎯 CENTRALIZED: Use Utils.build_deps_mapping() for path resolution
    result['_internalDepsMapping'] = Utils.build_deps_mapping(resource_path, internal_deps)
    
    # 🎯 Log overrides if any were detected and verbose mode is enabled
    if overrides and os.environ.get('TILT_LOG_LEVEL') == 'verbose':
        print("📝 Override(s) detected for {}: {}".format(app_name, ', '.join(overrides)))
    
    return result


def load_related_manifest(frontend_manifest, backend_suffix='-backend'):
    """
    Load the related backend manifest for a frontend resource.
    
    CEO Review update: Supports dual-filename and synthesis-by-default.
    
    Args:
        frontend_manifest: The loaded frontend manifest
        backend_suffix: Suffix to replace '-frontend' with
        
    Returns:
        Backend manifest dictionary, or None if not found
    """
    if frontend_manifest.get('appType') != 'frontend':
        return None
    
    resource_path = frontend_manifest.get('_servicePath', '')
    backend_path = resource_path.replace('-frontend', backend_suffix)
    
    # Use load_manifest which handles dual-filename and synthesis
    return load_manifest(backend_path)


def get_manifest_filename(resource_path):
    """
    Determine which manifest filename is being used for a resource.
    
    CEO Review addition: Utility for filename detection.
    
    Args:
        resource_path: Path to resource directory
        
    Returns:
        Filename string or None if neither exists (synthesis will be used)
    """
    # Check for manifest file (service.json)
    manifest_path = resource_path + '/' + MANIFEST_FILENAME
    if local("test -f '{path}' && echo 'yes' || echo 'no'".format(path=manifest_path), quiet=True, echo_off=True) == 'yes':
        return MANIFEST_FILENAME
    
    # Manifest not found - synthesis will be used
    return None
