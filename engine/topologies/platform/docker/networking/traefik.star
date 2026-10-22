# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🐳 TILT SDK - TRAEFIK LABELS GENERATOR
# =============================================================================

load(
    "./traefik_constants.star",
    "TRAEFIK_BACKEND_ENABLE_HTTP",
    "TRAEFIK_BACKEND_ENABLE_HTTPS",
    "TRAEFIK_PROJECT_HOST",
    "TRAEFIK_PROJECT_API_HOST",
    "TRAEFIK_DOCKER_NETWORK",
    "TRAEFIK_ENABLE_LABEL",
    "TRAEFIK_FRONTEND_ENABLE_HTTP",
    "TRAEFIK_FRONTEND_ENABLE_HTTPS",
    "TRAEFIK_FRONTEND_PRIORITY_BASE",
    "TRAEFIK_MIDDLEWARE_SUFFIX",
    "TRAEFIK_WEB_ENTRYPOINT",
    "TRAEFIK_WEBSECURE_ENTRYPOINT",
    "TRAEFIK_API_VERSION",
    "TRAEFIK_HEALTHCHECK_INTERVAL",
    "TRAEFIK_HEALTHCHECK_TIMEOUT",
    "TRAEFIK_HEALTHCHECK_RETRIES",
    "TRAEFIK_STARTUP_GRACE_PERIOD",
    "TRAEFIK_API_BASE_PATH",
)
load("./traefik_helpers.star",
    "backend_rule",
    "build_entrypoints",
    "cli_api_path",
    "frontend_rule",
    "get_api_path",
    "project_backend_rule",
)
load("./sablier_container_cycle.star",
    "sablier_middleware_suffix",
    "sablier_container_labels",
)
load("../compose/unsafe_value.star", "reject_unsafe_value")


def get_frontend_traefik_labels(res_name, domain, base_path, port, traefik_host=None, manifest=None):
    """Generate Traefik labels for frontend services."""
    reject_unsafe_value(res_name, 'res_name')
    reject_unsafe_value(domain, 'domain')
    reject_unsafe_value(base_path, 'base_path')
    reject_unsafe_value(port, 'port')
    reject_unsafe_value(traefik_host, 'traefik_host')
    
    # Priority based on path length ensures more specific paths win over broader ones
    router_priority = TRAEFIK_FRONTEND_PRIORITY_BASE + len(base_path or "")
    frontend_route_rule = frontend_rule(res_name, base_path, traefik_host)
    frontend_entrypoints = build_entrypoints(
        TRAEFIK_FRONTEND_ENABLE_HTTP,
        TRAEFIK_FRONTEND_ENABLE_HTTPS,
    )
    middleware_name = res_name + TRAEFIK_MIDDLEWARE_SUFFIX
    
    # Check if maintenance feature is enabled
    features = manifest.get('featuresEnabled', []) if manifest else []
    maintenance_middleware = ""
    if 'maintenance' in features:
        maintenance_middleware = ",maintenance@file"

    # On-demand scaling: attach the Sablier middleware when opted in via the manifest
    sablier_middleware, sablier_enabled = sablier_middleware_suffix(manifest, res_name)

    labels = """        - "{traefik_enable_label}"
        - 'traefik.http.routers.{res_name}.rule={frontend_route_rule}'
        - "traefik.http.routers.{res_name}.entrypoints={frontend_entrypoints}"
        - "traefik.http.routers.{res_name}.priority={router_priority}"
        - "traefik.http.routers.{res_name}.middlewares={middleware_name}{maintenance_middleware}{sablier_middleware}"
        - "traefik.http.middlewares.{middleware_name}.stripprefix.prefixes={base_path}"
        - "traefik.http.services.{res_name}.loadbalancer.server.port={port}"
        - "traefik.docker.network={traefik_network}\"""".format(
        res_name=res_name,
        traefik_enable_label=TRAEFIK_ENABLE_LABEL,
        frontend_route_rule=frontend_route_rule,
        frontend_entrypoints=frontend_entrypoints,
        middleware_name=middleware_name,
        base_path=base_path,
        port=port,
        router_priority=router_priority,
        traefik_network=TRAEFIK_DOCKER_NETWORK,
        maintenance_middleware=maintenance_middleware,
        sablier_middleware=sablier_middleware,
    )

    if sablier_enabled:
        labels += sablier_container_labels(manifest, res_name, "        ")

    return labels

def _stack_is_shared(manifest):
    """True when this backend shares its stack with another routable backend (`_stackBackendCount`, set by register_compose_resources).

    The stack-scoped routers (the host/`pathPrefix` router and `<name>-management`) carry one rule per stack. With two backends in
    one stack they would carry the same rule, so Traefik would pick between them arbitrarily. Each backend keeps its own
    `<name>-project` router (`/api/<name>`).
    """
    return bool(manifest) and manifest.get('_stackBackendCount', 1) > 1


def _explicit_backend_route(manifest):
    """The `traefik.host` / `traefik.pathPrefix` a manifest set on purpose, as (host, path); either may be empty."""
    traefik_cfg = (manifest.get('traefik') or {}) if manifest else {}
    return traefik_cfg.get('host') or '', traefik_cfg.get('pathPrefix') or ''


def get_backend_traefik_labels(
    resource_entry_name,
    traefik_host,
    traefik_path,
    traefik_resource_name,
    internal_port,
    health_path,
    manifest=None,
):
    """Generate Traefik labels for backend services with enhanced health checks."""
    reject_unsafe_value(resource_entry_name, 'resource_entry_name')
    reject_unsafe_value(traefik_host, 'traefik_host')
    reject_unsafe_value(traefik_path, 'traefik_path')
    reject_unsafe_value(traefik_resource_name, 'traefik_resource_name')
    reject_unsafe_value(health_path, 'health_path')
    reject_unsafe_value(internal_port, 'internal_port')
    if manifest:
        reject_unsafe_value(manifest.get('stack'), 'stack')
        traefik_cfg = manifest.get('traefik') or {}
        reject_unsafe_value(traefik_cfg.get('host'), 'traefik.host')
        reject_unsafe_value(traefik_cfg.get('pathPrefix'), 'traefik.pathPrefix')

    backend_route_rule = backend_rule(traefik_host, traefik_path)
    backend_entrypoints = build_entrypoints(
        TRAEFIK_BACKEND_ENABLE_HTTP,
        TRAEFIK_BACKEND_ENABLE_HTTPS,
    )
    middleware_name = resource_entry_name + TRAEFIK_MIDDLEWARE_SUFFIX
    
    # Check if maintenance feature is enabled
    features = manifest.get('featuresEnabled', []) if manifest else []
    maintenance_middleware = ""
    if 'maintenance' in features:
        maintenance_middleware = ",maintenance@file"

    # On-demand scaling: attach the Sablier middleware when opted in via the manifest
    sablier_middleware, sablier_enabled = sablier_middleware_suffix(manifest, resource_entry_name)

    # Build middleware config only if traefik_path is not empty
    if traefik_path:
        middleware_config_lines = [
            '      - "traefik.http.routers.' + resource_entry_name + '.middlewares=' + middleware_name + maintenance_middleware + sablier_middleware + '"',
            '      - "traefik.http.middlewares.' + middleware_name + '.stripprefix.prefixes=' + traefik_path + '"',
        ]
        middleware_config = "\n".join(middleware_config_lines)
    elif sablier_middleware:
        # No strip-prefix path, but still front the router with the Sablier middleware
        middleware_config = '      - "traefik.http.routers.' + resource_entry_name + '.middlewares=' + sablier_middleware.lstrip(",") + '"'
    else:
        # No middleware if path is empty - router has no middlewares
        middleware_config = ""

    stack_shared = _stack_is_shared(manifest)
    explicit_host, explicit_path = _explicit_backend_route(manifest)
    if stack_shared:
        # Another backend in this stack would match the same stack rule, so it is not emitted. The service labels stay (the
        # -project router points at the service). A manifest that set its own host or pathPrefix keeps a router, but one whose
        # rule is only what it set, never the shared stack host or path.
        backend_route_rule = backend_rule(explicit_host, explicit_path)

    if stack_shared and not backend_route_rule:
        backend_router_labels = ""
    else:
        backend_router_labels = """      - "traefik.http.routers.{resource_entry_name}.rule={backend_route_rule}"
      - "traefik.http.routers.{resource_entry_name}.entrypoints={backend_entrypoints}"
      - "traefik.http.routers.{resource_entry_name}.service={traefik_resource_name}"
{middleware_config}
""".format(
            resource_entry_name=resource_entry_name,
            backend_route_rule=backend_route_rule,
            backend_entrypoints=backend_entrypoints,
            traefik_resource_name=traefik_resource_name,
            middleware_config=middleware_config,
        )

    # No health path (a bring-your-own service that does not speak HTTP): Traefik balances without an active HTTP probe rather than
    # probing a path the service never serves.
    traefik_healthcheck_labels = ""
    if health_path:
        traefik_healthcheck_labels = """      - "traefik.http.services.{traefik_resource_name}.loadbalancer.healthcheck.path={health_path}"
      - "traefik.http.services.{traefik_resource_name}.loadbalancer.healthcheck.interval={health_interval}"
      - "traefik.http.services.{traefik_resource_name}.loadbalancer.healthcheck.timeout={health_timeout}"
      - "traefik.http.services.{traefik_resource_name}.loadbalancer.healthcheck.followredirects=false"
""".format(
            traefik_resource_name=traefik_resource_name,
            health_path=health_path,
            health_interval=TRAEFIK_HEALTHCHECK_INTERVAL,
            health_timeout=TRAEFIK_HEALTHCHECK_TIMEOUT,
        )

    labels = """      - "{traefik_enable_label}"
{backend_router_labels}      - "traefik.http.services.{traefik_resource_name}.loadbalancer.server.port={internal_port}"
{traefik_healthcheck_labels}      - "traefik.docker.network={traefik_network}"
""".format(
        resource_entry_name=resource_entry_name,
        traefik_enable_label=TRAEFIK_ENABLE_LABEL,
        backend_router_labels=backend_router_labels,
        traefik_resource_name=traefik_resource_name,
        internal_port=internal_port,
        traefik_healthcheck_labels=traefik_healthcheck_labels,
        traefik_network=TRAEFIK_DOCKER_NETWORK,
    )

    # Emit Sablier discovery labels so the Sablier container can wake/stop this workload
    if sablier_enabled:
        labels += sablier_container_labels(manifest, resource_entry_name, "      ")

    # Generate project localhost routing to match `flisk up` URLs:
    # http://api.{project}.localhost/api/{resource-name}
    if manifest:
        stack = manifest.get("stack", "")
        api_path = cli_api_path(resource_entry_name, manifest)
        project_rule = project_backend_rule(manifest, resource_entry_name)
        project_entrypoints = build_entrypoints(
            TRAEFIK_BACKEND_ENABLE_HTTP,
            TRAEFIK_BACKEND_ENABLE_HTTPS,
        )
        # Calculate priority based on path length (more specific = higher priority)
        router_priority = TRAEFIK_FRONTEND_PRIORITY_BASE + len(api_path)

        # Generate old path pattern for redirect (e.g., /{stack}-management/api/v1/)
        old_path_pattern = "/{stack}-management/api/v1".format(stack=stack) if stack else ""
        management_path = get_api_path(stack, manifest) if stack else ""

        labels += """
      - "traefik.http.routers.{resource_entry_name}-project.rule={project_rule}"
      - "traefik.http.routers.{resource_entry_name}-project.entrypoints={project_entrypoints}"
      - "traefik.http.routers.{resource_entry_name}-project.service={traefik_resource_name}"
      - "traefik.http.routers.{resource_entry_name}-project.middlewares={middleware_name}-project{maintenance_middleware}{sablier_middleware}"
      - "traefik.http.middlewares.{middleware_name}-project.stripprefix.prefixes={api_path}"
      - "traefik.http.routers.{resource_entry_name}-project.priority={router_priority}"
""".format(
            resource_entry_name=resource_entry_name,
            traefik_resource_name=traefik_resource_name,
            project_rule=project_rule,
            project_entrypoints=project_entrypoints,
            middleware_name=middleware_name,
            maintenance_middleware=maintenance_middleware,
            sablier_middleware=sablier_middleware,
            api_path=api_path,
            router_priority=router_priority,
        )

        if management_path and management_path != api_path and not stack_shared:
            labels += """
      - "traefik.http.routers.{resource_entry_name}-management.rule=Host(`{api_host}`) && PathPrefix(`{management_path}`)"
      - "traefik.http.routers.{resource_entry_name}-management.entrypoints={project_entrypoints}"
      - "traefik.http.routers.{resource_entry_name}-management.service={traefik_resource_name}"
      - "traefik.http.routers.{resource_entry_name}-management.middlewares={middleware_name}-management{sablier_middleware}"
      - "traefik.http.middlewares.{middleware_name}-management.stripprefix.prefixes={management_path}"
      - "traefik.http.routers.{resource_entry_name}-management.priority={mgmt_priority}"
""".format(
                resource_entry_name=resource_entry_name,
                traefik_resource_name=traefik_resource_name,
                api_host=TRAEFIK_PROJECT_API_HOST,
                management_path=management_path,
                project_entrypoints=project_entrypoints,
                middleware_name=middleware_name,
                sablier_middleware=sablier_middleware,
                mgmt_priority=TRAEFIK_FRONTEND_PRIORITY_BASE + len(management_path),
            )

        if old_path_pattern:
            labels += """
      # Redirect middleware for URL restructuring: old path -> new path
      - "traefik.http.middlewares.{resource_entry_name}-redirect.redirectregex.regex=^`{old_path_pattern}/(.*)`"
      - "traefik.http.middlewares.{resource_entry_name}-redirect.redirectregex.replacement=`{api_path}/$$1`"
      - "traefik.http.middlewares.{resource_entry_name}-redirect.redirectregex.permanent=true"
""".format(
                resource_entry_name=resource_entry_name,
                old_path_pattern=old_path_pattern,
                api_path=api_path,
            )

    return labels
