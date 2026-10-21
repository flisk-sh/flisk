# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🌐 TILT SDK - API GATEWAY (Referer-Based Context Routing)
# =============================================================================
# Path: .tilt/topologies/tilt/generators/api_gateway.star
# Purpose: Auto-discover backends and generate referer-based routing map
# =============================================================================

load('../../../../discovery/registry.star', 'get_app_resources', 'get_resource_aliases')


def _extract_referer_pattern(base_path, stack):
    """Extract referer pattern from basePath or stack - use actual names."""
    if base_path:
        return base_path.strip('/').lower()
    if stack:
        return stack.lower()
    return None


def _collect_backend_dependencies(frontend_manifest):
    """
    Resolve backend resource names for a frontend manifest's declared dependencies.
    Includes frontend's own backend and backend resources from dependency aliases.
    """
    if frontend_manifest == None:
        return None

    allowed = {}

    frontend_backend = frontend_manifest.get('backendName')
    if frontend_backend:
        allowed[frontend_backend] = True

    manifest_deps = frontend_manifest.get('dependencies')
    if manifest_deps == None:
        manifest_deps = frontend_manifest.get('dependsOn', [])

    aliases = get_resource_aliases()
    for dep in manifest_deps:
        dep_name = str(dep)
        if dep_name.endswith('-backend'):
            allowed[dep_name] = True
            continue

        alias_targets = aliases.get(dep_name, [])
        for target in alias_targets:
            if target.endswith('-backend'):
                allowed[target] = True

    return allowed


def _get_backend_port(backend_name, fallback = 4000):
    for service in get_app_resources():
        for resource in service.get('resources', []):
            if resource.get('name') == backend_name:
                manifest = resource.get('_manifest', {})
                app_type = manifest.get('appType', resource.get('app_type', 'backend'))
                if app_type == 'backend':
                    return manifest.get('containerPort', 3000)
                return resource.get('port', fallback)
    return fallback


def get_backend_routing_map(frontend_manifest = None):
    """
    Auto-scan all backends from discovered manifests and build referer-based routing map.
    Returns dict: {referer_pattern: {backend_name, port}}
    """
    routing_map = {}
    default_backend = None
    
    allowed_backends = _collect_backend_dependencies(frontend_manifest)

    for resource_group in get_app_resources():
        stack_name = resource_group.get('name', '')
        
        for resource in resource_group.get('resources', []):
            manifest = resource.get('_manifest', {})
            app_type = manifest.get('appType', resource.get('app_type', 'backend'))
            
            if app_type != 'backend':
                continue
            
            backend_name = resource.get('name', '')
            if allowed_backends != None and backend_name not in allowed_backends:
                continue
            if app_type == 'backend':
                port = manifest.get('containerPort', 3000)
            else:
                port = resource.get('port', 4000)
            
            base_path = manifest.get('basePath', '')
            stack = manifest.get('stack', stack_name)
            
            pattern = _extract_referer_pattern(base_path, stack)
            
            if pattern:
                routing_map[pattern] = {'name': backend_name, 'port': port}
            elif not default_backend:
                default_backend = {'name': backend_name, 'port': port}
    
    return routing_map, default_backend


def build_referer_map_block(frontend_manifest = None):
    """
    Build the nginx map block by scanning all manifests.
    Routes are sorted by specificity (longest path first) to ensure proper matching.
    Uses flexible matching to handle both /order/ and /orders paths.
    """
    routing_map, default_backend = get_backend_routing_map(frontend_manifest)
    
    sorted_patterns = sorted(routing_map.keys(), key=len, reverse=True)
    
    lines = [
        '    # Auto-discovered backend routing map (referer-based context routing)',
        '    map $http_referer $api_backend {'
    ]
    
    for pattern in sorted_patterns:
        backend = routing_map[pattern]
        backend_url = 'http://{}:{}'.format(backend['name'], backend['port'])
        lines.append('        ~*{} {};'.format(pattern, backend_url))
    
    if default_backend:
        default_url = 'http://{}:{}'.format(default_backend['name'], default_backend['port'])
        lines.append('        default {};'.format(default_url))
    elif frontend_manifest != None and frontend_manifest.get('backendName'):
        backend_name = frontend_manifest.get('backendName')
        backend_port = _get_backend_port(backend_name, 4000)
        lines.append('        default http://{}:{};'.format(backend_name, backend_port))
    else:
        # No hardcoded fallback - backendName must be specified in manifest
        lines.append('        default http://backend-not-configured:4000;')
    
    lines.append('    }')
    
    return '\n'.join(lines)


ApiGateway = struct(
    get_backend_routing_map = get_backend_routing_map,
    build_referer_map_block = build_referer_map_block,
)
