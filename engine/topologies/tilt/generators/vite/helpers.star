# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# ⚡ TILT SDK - VITE PROVIDER HELPERS
# =============================================================================
# Path: .tilt/providers/vite/helpers.star
# Purpose: Shared helper functions for Vite generators
# =============================================================================

load('../../../../topologies/tilt/common/utils.star', 'Utils')

# Load npm scope from project.json (or use project name as default)
# Use TDK_PROJECT_ROOT env var set by Tilt, fallback to current directory
def _load_npm_scope():
    project_root = os.environ.get('TDK_PROJECT_ROOT', '')
    project_json_path = '.tdk/project.json'
    if project_root:
        project_json_path = project_root + '/' + project_json_path
    
    if os.path.exists(project_json_path):
        _project_json = read_json(project_json_path)
        return _project_json.get('project', {}).get('name', 'tdk-project')
    return 'tdk-project'

_NPM_SCOPE = _load_npm_scope()
# =============================================================================
# API PATH CONSTANTS - Import for full descriptive API naming
# =============================================================================
load('../../../../topologies/platform/docker/networking/api_path_constants.star',
     'get_api_path_for_stack',
     'build_traefik_url')


def build_header(generator_fn, app_name, extra_header=''):
    """Build the standard file header using shared utility."""
    return Utils.get_template_header(
        'vite',
        'Vite.' + generator_fn,
        app_name,
        extra_header
    )


def generate_frontend_internal_aliases(resource_path, manifest, config_depth_offset=0):
    """
    Generate internal package aliases for frontend Vite config.
    
    Convention over Configuration:
        @{npm_scope}/platform-x → {rel_to_root}shared-platform-engineering/platform-x/src
        @{npm_scope}/product-x  → {rel_to_root}shared-product-engineering/product-x/src
    """
    internal_deps = manifest.get('_internalDeps', [])

    if not internal_deps:
        return '      // No internal dependencies detected'

    # Calculate depth for relative paths (Starlark-compatible)
    resource_parts = []
    for p in resource_path.split('/'):
        if p:
            resource_parts.append(p)
    depth = len(resource_parts) + config_depth_offset
    rel_to_root = '../' * depth

    lines = ['      // 🔥 Auto-generated internal package aliases (from package.json)']

    for dep in sorted(internal_deps):
        if dep.startswith('@' + _NPM_SCOPE + '/'):
            lib_name = dep.replace('@' + _NPM_SCOPE + '/', '')
            
            # Determine library root by naming convention
            if lib_name.startswith('platform-'):
                lib_path = rel_to_root + 'shared-platform-engineering/' + lib_name + '/dist'
            elif lib_name.startswith('product-'):
                lib_path = rel_to_root + 'shared-product-engineering/' + lib_name + '/dist'
            elif lib_name in ['domain', 'application', 'infrastructure', 'presentation']:
                lib_path = rel_to_root + 'shared-ddd-layers/' + lib_name + '/src'
            else:
                lib_path = rel_to_root + 'shared-platform-engineering/' + lib_name + '/src'
            
            lines.append("      '" + dep + "': resolve(__dirname, '" + lib_path + "'),")
    
    return '\n'.join(lines)


def generate_frontend_optimize_deps(manifest):
    """Generate optimizeDeps.include array for faster Vite dev startup."""
    internal_deps = manifest.get('_internalDeps', [])
    
    if not internal_deps:
        return ''
    
    # Filter optimize deps (Starlark-compatible)
    optimize_deps = []
    for dep in internal_deps:
        if dep.startswith('@' + _NPM_SCOPE + '/'):
            optimize_deps.append(dep)
    
    if not optimize_deps:
        return ''
    
    # Build quoted deps list (Starlark-compatible)
    quoted_deps = []
    for dep in sorted(optimize_deps):
        quoted_deps.append("'" + dep + "'")
    
    return '\n      ' + ',\n      '.join(quoted_deps) + ',\n    '


def generate_proxy_block(api_base_path, backend_port, additional_routes, stack='app'):
    """Generate Vite proxy config using full descriptive API paths.
    
    Uses API naming convention with full service names from manifest:
    - Pattern: /api/v1/{app-name}
    - Generated from manifest "stack" and "appName" fields
    
    Args:
        api_base_path: The base API path (from manifest)
        backend_port: Backend resource port (kept for compatibility)
        additional_routes: Additional proxy routes
        stack: Resource stack name (from manifest.json)
    
    Returns:
        Vite proxy configuration string
    """
    # Get full descriptive API path for this stack using constants
    # This replaces the old pattern: 'http://localhost:' + str(backend_port)
    api_path = get_api_path_for_stack(stack)
    
    # Build Traefik gateway URL using the full API path
    # Format: http://{project}.localhost/api/v1/{full-service-name}
    local_target = build_traefik_url(api_path)
    
    routes = [
        (api_base_path, local_target),
        ('/health', local_target),
        ('/trpc', local_target),
    ]
    
    for route in additional_routes:
        if type(route) == 'dict':
            routes.append((route.get('path', '/'), route.get('target', local_target)))
        else:
            routes.append((route, local_target))
    
    lines = ['    proxy: {']
    for path, target in routes:
        lines.append("      '" + path + "': {")
        lines.append("        target: '" + target + "',")
        lines.append("        changeOrigin: true,")
        lines.append("        secure: false,")
        lines.append("      },")
    lines.append('    },')
    
    return '\n'.join(lines)


def generate_backend_path_aliases(resource_path, manifest):
    """Generate TypeScript path aliases for DDD architecture (Premium - requires TDK_LICENSE_KEY)."""
    lines = []

    # DDD is a premium feature: requires both "ddd" in the resource's service.json
    # features: [] AND a configured license key. The key presence check here is a
    # cheap belt-and-suspenders guard (mirrors _load_verdaccio in infra-loader.star) -
    # it can't verify the key actually grants "ddd" (Starlark has no fetch), so a
    # hand-edited features: ["ddd"] with no key at all is still blocked, but real
    # entitlement is checked client-side by hasDddLicense() in extension-fetch.ts
    # before the CLI ever writes "ddd" into a resource's features array.
    ddd_enabled = 'ddd' in manifest.get('featuresEnabled', []) and os.environ.get('TDK_LICENSE_KEY', '') != ''

    if ddd_enabled:
        ddd_aliases = [
            ('@application', './src/application'),
            ('@domain', './src/domain'),
            ('@infrastructure', './src/infrastructure'),
            ('@presentation', './src/presentation'),
            ('@test', './src/tests'),
        ]

        for alias, rel_path in ddd_aliases:
            lines.append("      '" + alias + "': path.resolve(__dirname, '" + rel_path + "'),")

    resource_parts = []
    for p in resource_path.split('/'):
        if p:
            resource_parts.append(p)
    depth = len(resource_parts)
    rel_to_root = '../' * depth
    
    internal_deps = manifest.get('_internalDeps', [])
    for dep in sorted(internal_deps):
        if dep.startswith('@' + _NPM_SCOPE + '/'):
            lib_name = dep.replace('@' + _NPM_SCOPE + '/', '')
            
            if lib_name.startswith('platform-'):
                lib_path = rel_to_root + 'shared-platform-engineering/' + lib_name + '/dist'
            elif lib_name.startswith('product-'):
                lib_path = rel_to_root + 'shared-product-engineering/' + lib_name + '/dist'
            elif lib_name in ['domain', 'application', 'infrastructure', 'presentation']:
                lib_path = rel_to_root + 'shared-ddd-layers/' + lib_name + '/src'
            else:
                lib_path = rel_to_root + 'shared-platform-engineering/' + lib_name + '/src'
            
            lines.append("      '" + dep + "': path.resolve(__dirname, '" + lib_path + "'),")
    
    return '\n'.join(lines)


def generate_externals_config(manifest):
    """Generate Rollup externals for Node.js backend build."""
    externals = [
        '/^node:.*/',
        '@prisma/client',
        'prisma',
        'hono',
        'nats',
    ]
    
    if manifest.get('usePrisma'):
        externals.extend(['.prisma/client', '@prisma/adapter-pg'])
    
    if manifest.get('useNats'):
        externals.append('nats')
    
    # Build externals config (Starlark-compatible)
    externals_quoted = []
    for e in externals:
        if not e.startswith('/'):
            externals_quoted.append("'" + e + "'")
        else:
            externals_quoted.append(e)
    
    return '[' + ', '.join(externals_quoted) + ']'


def generate_vitest_inline_deps(manifest):
    """Generate Vitest inline deps for internal packages."""
    internal_deps = manifest.get('_internalDeps', [])
    
    # Filter inline deps (Starlark-compatible)
    inline_deps = []
    for dep in internal_deps:
        if dep.startswith('@' + _NPM_SCOPE + '/'):
            inline_deps.append(dep)
    
    if not inline_deps:
        return ''
    
    # Build quoted deps list (Starlark-compatible)
    quoted_deps = []
    for dep in inline_deps:
        quoted_deps.append("'" + dep + "'")
    
    return '\n        ' + ',\n        '.join(quoted_deps) + ',\n      '

CONSTANTS = {}
