# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🎯 TILT SDK - ORCHESTRATOR APPLY
# =============================================================================
# Purpose: thin coordinator for service apply lifecycle.
# =============================================================================

load("../../common/utils_debug.star", "debug_log")
load('../databases.star', 'Database')
load('./apply_runtime_flags.star', 'RuntimeFlags')
load('./apply_resource_validation.star', 'ResourceValidation')
load('./apply_manifest_orchestration.star', 'ManifestOrchestration')
load('./apply_compose_resource_registration.star', 'ComposeResourceRegistration', 'resource_needs_database')
load('./apply_migrator_orchestration.star', 'MigratorOrchestration')


def apply_app_service(resource_config, ctx):
    """
    Load and configure an application service by delegating each responsibility
    to a focused orchestration module.
    """
    resource_name = resource_config.get('appName', resource_config.get('name', 'UNKNOWN'))
    resource_path = resource_config.get('path', 'NO_PATH')
    should_enable = ctx['should_enable']

    # resource_config here is a STACK-level grouping from discovery_orchestrator.star
    # (its own 'name'/'appName' is the stack, e.g. "auth") - the actual
    # individual services live nested in resource_config['resources'], each
    # with its own 'name' (e.g. "auth-api-backend"). tdk stack/tdk project -
    # the CLI's own standard scaffolding - populates spec.master's
    # PRE_ALPHA_RESOURCES etc. keyed by individual SERVICE name, not stack
    # name. Checking should_enable() only at the stack level silently drops
    # every service whose stack name isn't itself individually enabled, even
    # when the service is - which is the common case for any project using
    # the CLI's normal `tdk resource` + `tdk stack` workflow. Fall back to
    # checking each nested service name before giving up on this group.
    stack_enabled = should_enable(resource_name)
    service_enabled = False
    if not stack_enabled:
        for nested in resource_config.get('resources', []):
            nested_name = nested.get('name', '')
            if nested_name and should_enable(nested_name):
                debug_log("APPLY: stack '{}' not individually enabled, but nested service '{}' is - proceeding".format(resource_name, nested_name))
                service_enabled = True
                break

    if not stack_enabled and not service_enabled:
        return

    runtime_flags = RuntimeFlags.resolve()
    ctx['auto_init_config_gen'] = runtime_flags['auto_init_config_gen']

    ResourceValidation.validate(resource_config)

    # Provision the database when a resource receives DATABASE_URL (backend or bring-your-own), not for frontends only.
    has_backend = False
    for resource in resource_config.get('resources', []):
        if resource_needs_database(resource.get('_manifest', {})):
            has_backend = True
            break
    
    if should_enable('database-management') and has_backend:
        Database.provision(resource_name)

    manifest_state = ManifestOrchestration.prepare(resource_config, ctx)
    compose_state = ComposeResourceRegistration.register(
        resource_config,
        ctx,
        runtime_flags,
        manifest_state,
    )

    MigratorOrchestration.register(
        resource_config,
        ctx,
        runtime_flags,
        compose_state['compose_project_name'],
    )
