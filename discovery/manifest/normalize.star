# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📋 TILT SDK - MANIFEST NORMALIZATION & DISCOVERY
# =============================================================================
# Path: .tilt/topologies/tilt/discovery/manifest/normalize.star
# Purpose: Normalize manifests and provide helper accessors
# =============================================================================

load('../../engine/topologies/tilt/manifest/parser.star', 'generated_string_error')
load('./constants.star', 'MANIFEST_DEFAULTS', 'MANIFEST_FILENAME')
load('./loading.star', 'apply_manifest_defaults', 'check_prisma_folder', 'get_default_syncs_for_type')
load('./validation.star', 'validate_manifest')
load('../../engine/topologies/tilt/common/utils.star', 'Utils')
load('../../engine/topologies/platform/docker/constants.star', 'PlatformDockerConstants')
load('../../specs/specs/TILT_TECH_STACK.star', 'RUNTIME', 'MESSAGING')


def _load_and_normalize(manifest_path, warn_only=True):
    """
    🎯 MAIN ENTRY POINT: Load manifest and normalize to full resource config.
    
    This function is the bridge between the discovery system (resource_registry.star)
    and the manifest loading system. It:
    
    1. Reads the JSON file
    2. Validates the structure
    3. Normalizes with smart defaults
    4. Computes labels, syncs, has_migrator
    5. Returns a resource-ready configuration
    
    Args:
        manifest_path: Full path to manifest file
        warn_only: If True, return None on error instead of failing
        
    Returns:
        Normalized manifest dict or None on error (if warn_only=True)
    """
    # Prepend project root to relative paths for correct resolution
    project_root = os.environ.get('TDK_PROJECT_ROOT', '')
    if project_root and not manifest_path.startswith('/'):
        full_path = project_root + '/' + manifest_path
    else:
        full_path = manifest_path
    
    # Read manifest file
    content = read_file(full_path, default='')
    
    if not content or not str(content).strip():
        if warn_only:
            print("   ⚠️  Empty or missing manifest: " + manifest_path)
            return None
        fail("Empty or missing manifest: " + manifest_path)
    
    # Parse JSON
    manifest = decode_json(content)
    if manifest == None:
        if warn_only:
            print("   ⚠️  Invalid JSON in manifest: " + manifest_path)
            return None
        fail("Invalid JSON in manifest: " + manifest_path)

    # Refuse service.json values that would add keys to generated config (GHSA-phgf-pww4-7jxc)
    unsafe_field_error = generated_string_error(manifest, manifest_path) if type(manifest) == "dict" else None
    if unsafe_field_error:
        fail(unsafe_field_error)
    
    # Validate
    issues = validate_manifest(manifest)
    if issues:
        if warn_only:
            for issue in issues:
                print("   ⚠️  " + manifest_path + ": " + issue)
            return None
        fail("Manifest validation failed:\n" + "\n".join(issues))
    
    # Extract service path from manifest path
    resource_path = manifest_path.rsplit('/', 1)[0]
    
    # BUG FIX: Normalize various path patterns to project-relative paths
    # Pattern 1: Worktrees - .worktrees/task1-dry/services/platform/...
    # Pattern 2: Flisk output - .tdk/.tdk-out/../.. or .tdk/.tdk-out/../../path
    
    if resource_path.startswith('.worktrees/'):
        # Extract the part after the worktree name
        parts = resource_path.split('/')
        if len(parts) >= 3:
            resource_path = '/'.join(parts[2:])
    elif '.worktrees/' in resource_path:
        worktree_idx = resource_path.find('.worktrees/')
        after_worktree = resource_path[worktree_idx:]
        parts = after_worktree.split('/')
        if len(parts) >= 3:
            resource_path = '/'.join(parts[2:])
    elif '.tdk/.tdk-out/../..' in resource_path:
        # Handle Flisk output paths like: /path/to/.tdk/.tdk-out/../.. or .tdk/.tdk-out/../../services/...
        tdk_idx = resource_path.find('.tdk/.tdk-out/../..')
        if tdk_idx != -1:
            after_tdk = resource_path[tdk_idx + len('.tdk/.tdk-out/../..'):]
            if after_tdk.startswith('/'):
                after_tdk = after_tdk[1:]
            resource_path = after_tdk
    elif resource_path.endswith('.tdk/.tdk-out/../..'):
        # Handle bare Flisk output path that ends with just the resolution pattern
        resource_path = ''
    
    # Apply smart defaults
    normalized = apply_manifest_defaults(manifest, resource_path)
    
    # Compute additional fields for registry compatibility
    app_name = normalized.get('appName', '')
    app_type = normalized.get('appType', 'backend')
    stack = normalized.get('stack', '')
    features = normalized.get('featuresEnabled', [])
    
    # 🎯 AUTO-COMPUTE labels from stack
    normalized['labels'] = ['app.' + stack]
    
    # 🎯 AUTO-DETECT has_migrator
    has_migrator = 'prisma' in features
    if not has_migrator:
        has_migrator = check_prisma_folder(resource_path)
    normalized['has_migrator'] = has_migrator
    
    # 🎯 AUTO-COMPUTE syncs if not specified
    if normalized.get('syncs') == None:
        normalized['syncs'] = get_default_syncs_for_type(app_type, features)
    
    # 🎯 COMPUTE dockerfile path
    dockerfile = normalized.get('dockerfile', 'Dockerfile')
    normalized['dockerfile_path'] = app_name + '/' + dockerfile
    
    # 🎯 MARK as frontend if applicable
    if app_type == 'frontend':
        normalized['frontend'] = True
    
    # 🎯 EXTRACT dependencies for registry
    normalized['serviceDependencies'] = normalized.get('dependsOn', [])

    return normalized


def _discover_manifests_in_path(root_path):
    """
    Discover all manifest files under a root path.
    
    Args:
        root_path: Directory to search (e.g., 'services/product')
        
    Returns:
        List of manifest file paths
    """
    find_cmd = "find {root} -name '{filename}' -type f 2>/dev/null | sort".format(
        root=root_path,
        filename=MANIFEST_FILENAME
    )
    result = str(local(find_cmd, quiet=True, echo_off=True))
    
    manifests = []
    if result:
        for line in result.strip().split('\n'):
            if line and line.strip():
                manifests.append(line.strip())
    
    return manifests


def _load_all_manifests(root_path, warn_only=True):
    """
    Load and normalize all manifests under a root path.
    
    Args:
        root_path: Directory to search (e.g., 'services/product')
        warn_only: If True, skip invalid manifests with warnings
        
    Returns:
        List of normalized manifest dicts
    """
    manifest_paths = _discover_manifests_in_path(root_path)
    manifests = []
    
    for path in manifest_paths:
        normalized = _load_and_normalize(path, warn_only=warn_only)
        if normalized:
            manifests.append(normalized)
    
    return manifests


def _get_port(manifest):
    """Get the resource port from manifest."""
    return manifest.get('port', MANIFEST_DEFAULTS['port'])


def _get_database_url(manifest, host='localhost', port=5432):
    """
    Generate DATABASE_URL from manifest.
    
    Args:
        manifest: Manifest dictionary
        host: Database host (default: localhost)
        port: Database port (default: 5432)
        
    Returns:
        PostgreSQL connection string
    """
    db_name = manifest.get('databaseName', PlatformDockerConstants.get_db_name(manifest.get('stack', 'app')))
    return PlatformDockerConstants.get_tilt_database_url_template().format(
        host=host,
        port=port,
        db=db_name,
    )


def _print_summary(manifests):
    """
    Print formatted summary of loaded manifests.
    
    Args:
        manifests: List of manifest dictionaries
    """
    print("")
    print("📋 ═══════════════════════════════════════════════════════════════")
    print("📋  LOADED MANIFESTS")
    print("📋 ═══════════════════════════════════════════════════════════════")
    
    for m in manifests:
        status = "✅" if not m.get('_synthesized') else "⚡"
        app_name = m.get('appName', 'unknown')
        app_type = m.get('appType', 'unknown')
        port = m.get('port', 0)
        stack = m.get('stack', 'unknown')
        
        print("   {status} {name} | {type} | Port: {port} | Stack: {stack}".format(
            status=status,
            name=app_name,
            type=app_type,
            port=port,
            stack=stack,
        ))
    
    print("📋 ═══════════════════════════════════════════════════════════════")
    print("")


def _generate_manifest_template(app_name, stack, app_type='backend', port=4000):
    """
    🎯 TEMPLATE GENERATOR: Returns a string with a standard manifest.
    """
    template = {
        "$schema": PlatformDockerConstants.RESOURCE_SCHEMA_URL,
        "appName": app_name,
        "appType": app_type,
        "stack": stack,
        "port": port,
        "replicas": 1,
        "featuresEnabled": [MESSAGING, "infisical"],
        "dependsOn": [],
        "runtime": RUNTIME
    }
    return Utils.encode_json(template)


def load_and_normalize(manifest_path, warn_only=True):
    return _load_and_normalize(manifest_path, warn_only=warn_only)


def discover_manifests_in_path(root_path):
    return _discover_manifests_in_path(root_path)


def load_all_manifests(root_path, warn_only=True):
    return _load_all_manifests(root_path, warn_only=warn_only)


def get_port(manifest):
    return _get_port(manifest)


def get_database_url(manifest, host='localhost', port=5432):
    return _get_database_url(manifest, host=host, port=port)


def print_summary(manifests):
    return _print_summary(manifests)


def generate_manifest_template(app_name, stack, app_type='backend', port=4000):
    return _generate_manifest_template(app_name, stack, app_type=app_type, port=port)
