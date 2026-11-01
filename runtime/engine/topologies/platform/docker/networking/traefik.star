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
    "TRAEFIK_PROJECT_LABEL",
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
    "byo_ui_host",
    "byo_web_ui",
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
load("../constants.star", "PROJECT_NAME_HYPHEN")


def _project_slug():
    """The project name with every character except letters and digits written as `_` plus its six-digit hex code.

    The result has no `-` in it, so the first `-` in a scoped name always separates the project from the resource. That
    keeps the mapping one-to-one: `team` + `app-api` and `team-app` + `api` get different names, and so do `a-b` and `a_b`.
    """
    return "".join([ch if ch.isalnum() else "_" + _hex6(ord(ch)) for ch in PROJECT_NAME_HYPHEN.elems()])


def _hex6(code):
    """`code` in hex, zero-padded to six digits so every escape has the same width."""
    return ("000000" + "%x" % code)[-6:]


def traefik_scoped_name(name):
    """Router, middleware and service name for `name`, prefixed with this Flisk project.

    One Traefik instance serves every Flisk project on the machine, and it keys routers, middlewares and services by name
    alone. Two projects that name a resource the same (`api`, say) would define the same router twice, and Traefik drops both.
    The project prefix keeps them apart.
    """
    return _project_slug() + "-" + name


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
    router_name = traefik_scoped_name(res_name)
    middleware_name = router_name + TRAEFIK_MIDDLEWARE_SUFFIX

    # Check if maintenance feature is enabled
    features = manifest.get('featuresEnabled', []) if manifest else []
    maintenance_middleware = ""
    if 'maintenance' in features:
        maintenance_middleware = ",maintenance@file"

    # On-demand scaling: attach the Sablier middleware when opted in via the manifest
    sablier_middleware, sablier_enabled = sablier_middleware_suffix(manifest, res_name)

    # Next.js serves under its own basePath, so the prefix must reach it: the route keeps /<name> and adds no stripprefix middleware.
    strips_prefix = not manifest or manifest.get('framework') != 'next'
    if strips_prefix:
        middlewares = middleware_name + maintenance_middleware + sablier_middleware
        middleware_labels = """        - "traefik.http.routers.{router_name}.middlewares={middlewares}"
        - "traefik.http.middlewares.{middleware_name}.stripprefix.prefixes={base_path}"
""".format(router_name=router_name, middlewares=middlewares, middleware_name=middleware_name, base_path=base_path)
    else:
        middlewares = (maintenance_middleware + sablier_middleware).lstrip(",")
        middleware_labels = ""
        if middlewares:
            middleware_labels = """        - "traefik.http.routers.{router_name}.middlewares={middlewares}"
""".format(router_name=router_name, middlewares=middlewares)

    labels = """        - "{traefik_enable_label}"
        - "{traefik_project_label}"
        - 'traefik.http.routers.{router_name}.rule={frontend_route_rule}'
        - "traefik.http.routers.{router_name}.entrypoints={frontend_entrypoints}"
        - "traefik.http.routers.{router_name}.priority={router_priority}"
{middleware_labels}        - "traefik.http.services.{router_name}.loadbalancer.server.port={port}"
        - "traefik.docker.network={traefik_network}\"""".format(
        router_name=router_name,
        traefik_enable_label=TRAEFIK_ENABLE_LABEL,
        traefik_project_label=TRAEFIK_PROJECT_LABEL,
        frontend_route_rule=frontend_route_rule,
        frontend_entrypoints=frontend_entrypoints,
        middleware_labels=middleware_labels,
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


def _byo_web_ui_labels(resource_entry_name, traefik_resource_name, internal_port, health_path, manifest):
    """Traefik labels for a bring-your-own web UI (`webUi: true`, #2997): one router on Host(`<name>.<project>.localhost`).

    No path prefix is matched or stripped, so the app serves its pages and assets from `/` as it does without Flisk. There is no
    /api/<name> router: that path cannot serve a page. An explicit `traefik.host` is an extra host name for the same router.
    """
    router_name = traefik_scoped_name(resource_entry_name)
    service_name = traefik_scoped_name(traefik_resource_name)
    explicit_host, _ = _explicit_backend_route(manifest)
    rule = "Host(`{}`)".format(byo_ui_host(traefik_resource_name))
    if explicit_host:
        rule += " || Host(`{}`)".format(explicit_host)
    entrypoints = build_entrypoints(TRAEFIK_BACKEND_ENABLE_HTTP, TRAEFIK_BACKEND_ENABLE_HTTPS)

    middlewares = ""
    if 'maintenance' in manifest.get('featuresEnabled', []):
        middlewares += ",maintenance@file"
    sablier_middleware, sablier_enabled = sablier_middleware_suffix(manifest, resource_entry_name)
    middlewares = (middlewares + sablier_middleware).lstrip(",")
    middleware_labels = ""
    if middlewares:
        middleware_labels = '      - "traefik.http.routers.{}.middlewares={}"\n'.format(router_name, middlewares)

    healthcheck_labels = ""
    if health_path:
        healthcheck_labels = """      - "traefik.http.services.{service_name}.loadbalancer.healthcheck.path={health_path}"
      - "traefik.http.services.{service_name}.loadbalancer.healthcheck.interval={health_interval}"
      - "traefik.http.services.{service_name}.loadbalancer.healthcheck.timeout={health_timeout}"
      - "traefik.http.services.{service_name}.loadbalancer.healthcheck.followredirects=false"
""".format(
            service_name=service_name,
            health_path=health_path,
            health_interval=TRAEFIK_HEALTHCHECK_INTERVAL,
            health_timeout=TRAEFIK_HEALTHCHECK_TIMEOUT,
        )

    labels = """      - "{enable}"
      - "{project_label}"
      - "traefik.http.routers.{router_name}.rule={rule}"
      - "traefik.http.routers.{router_name}.entrypoints={entrypoints}"
      - "traefik.http.routers.{router_name}.service={service_name}"
{middleware_labels}      - "traefik.http.services.{service_name}.loadbalancer.server.port={internal_port}"
{healthcheck_labels}      - "traefik.docker.network={network}"
""".format(
        enable=TRAEFIK_ENABLE_LABEL,
        project_label=TRAEFIK_PROJECT_LABEL,
        router_name=router_name,
        rule=rule,
        entrypoints=entrypoints,
        service_name=service_name,
        middleware_labels=middleware_labels,
        internal_port=internal_port,
        healthcheck_labels=healthcheck_labels,
        network=TRAEFIK_DOCKER_NETWORK,
    )
    if sablier_enabled:
        labels += sablier_container_labels(manifest, resource_entry_name, "      ")
    return labels


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

    if byo_web_ui(manifest):
        return _byo_web_ui_labels(
            resource_entry_name=resource_entry_name,
            traefik_resource_name=traefik_resource_name,
            internal_port=internal_port,
            health_path=health_path,
            manifest=manifest,
        )

    backend_route_rule = backend_rule(traefik_host, traefik_path)
    backend_entrypoints = build_entrypoints(
        TRAEFIK_BACKEND_ENABLE_HTTP,
        TRAEFIK_BACKEND_ENABLE_HTTPS,
    )
    router_name = traefik_scoped_name(resource_entry_name)
    service_name = traefik_scoped_name(traefik_resource_name)
    middleware_name = router_name + TRAEFIK_MIDDLEWARE_SUFFIX

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
            '      - "traefik.http.routers.' + router_name + '.middlewares=' + middleware_name + maintenance_middleware + sablier_middleware + '"',
            '      - "traefik.http.middlewares.' + middleware_name + '.stripprefix.prefixes=' + traefik_path + '"',
        ]
        middleware_config = "\n".join(middleware_config_lines)
    elif sablier_middleware:
        # No strip-prefix path, but still front the router with the Sablier middleware
        middleware_config = '      - "traefik.http.routers.' + router_name + '.middlewares=' + sablier_middleware.lstrip(",") + '"'
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
        backend_router_labels = """      - "traefik.http.routers.{router_name}.rule={backend_route_rule}"
      - "traefik.http.routers.{router_name}.entrypoints={backend_entrypoints}"
      - "traefik.http.routers.{router_name}.service={service_name}"
{middleware_config}
""".format(
            router_name=router_name,
            backend_route_rule=backend_route_rule,
            backend_entrypoints=backend_entrypoints,
            service_name=service_name,
            middleware_config=middleware_config,
        )

    # No health path (a bring-your-own service that does not speak HTTP): Traefik balances without an active HTTP probe rather than
    # probing a path the service never serves.
    traefik_healthcheck_labels = ""
    if health_path:
        traefik_healthcheck_labels = """      - "traefik.http.services.{service_name}.loadbalancer.healthcheck.path={health_path}"
      - "traefik.http.services.{service_name}.loadbalancer.healthcheck.interval={health_interval}"
      - "traefik.http.services.{service_name}.loadbalancer.healthcheck.timeout={health_timeout}"
      - "traefik.http.services.{service_name}.loadbalancer.healthcheck.followredirects=false"
""".format(
            service_name=service_name,
            health_path=health_path,
            health_interval=TRAEFIK_HEALTHCHECK_INTERVAL,
            health_timeout=TRAEFIK_HEALTHCHECK_TIMEOUT,
        )

    labels = """      - "{traefik_enable_label}"
      - "{traefik_project_label}"
{backend_router_labels}      - "traefik.http.services.{service_name}.loadbalancer.server.port={internal_port}"
{traefik_healthcheck_labels}      - "traefik.docker.network={traefik_network}"
""".format(
        router_name=router_name,
        traefik_enable_label=TRAEFIK_ENABLE_LABEL,
        traefik_project_label=TRAEFIK_PROJECT_LABEL,
        backend_router_labels=backend_router_labels,
        service_name=service_name,
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
      - "traefik.http.routers.{router_name}-project.rule={project_rule}"
      - "traefik.http.routers.{router_name}-project.entrypoints={project_entrypoints}"
      - "traefik.http.routers.{router_name}-project.service={service_name}"
      - "traefik.http.routers.{router_name}-project.middlewares={middleware_name}-project{maintenance_middleware}{sablier_middleware}"
      - "traefik.http.middlewares.{middleware_name}-project.stripprefix.prefixes={api_path}"
      - "traefik.http.routers.{router_name}-project.priority={router_priority}"
""".format(
            router_name=router_name,
            service_name=service_name,
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
      - "traefik.http.routers.{router_name}-management.rule=Host(`{api_host}`) && PathPrefix(`{management_path}`)"
      - "traefik.http.routers.{router_name}-management.entrypoints={project_entrypoints}"
      - "traefik.http.routers.{router_name}-management.service={service_name}"
      - "traefik.http.routers.{router_name}-management.middlewares={middleware_name}-management{sablier_middleware}"
      - "traefik.http.middlewares.{middleware_name}-management.stripprefix.prefixes={management_path}"
      - "traefik.http.routers.{router_name}-management.priority={mgmt_priority}"
""".format(
                router_name=router_name,
                service_name=service_name,
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
      - "traefik.http.middlewares.{router_name}-redirect.redirectregex.regex=^`{old_path_pattern}/(.*)`"
      - "traefik.http.middlewares.{router_name}-redirect.redirectregex.replacement=`{api_path}/$$1`"
      - "traefik.http.middlewares.{router_name}-redirect.redirectregex.permanent=true"
""".format(
                router_name=router_name,
                old_path_pattern=old_path_pattern,
                api_path=api_path,
            )

    return labels
