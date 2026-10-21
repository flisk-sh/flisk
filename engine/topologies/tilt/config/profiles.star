# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🎯 TOPOLOGIES - FOCUS PROFILES
# =============================================================================

load("../../../topologies/tilt/common/utils.star", "Utils")
load(
    "../../../../discovery/registry.star",
    "APP_RESOURCES",
    "CORE_INFRA_EXPORT",
    "INFRA_STACK_MAP_EXPORT",
    "OPTIONAL_INFRA_EXPORT",
    "DEFAULTS_EXPORT",
    "FOCUS_PRE_ALPHA_EXPORT",
    "FOCUS_ALPHA_EXPORT",
    "FOCUS_BETA_EXPORT",
    "get_app_resources",
    "get_app_resources_ref",
    "get_resource_aliases_ref",
    "get_resource_dependencies_ref",
)

# =============================================================================
# 🎯 RELEASE PHASE MAPPINGS
# =============================================================================
# Map release phase names to service lists from spec.master

RELEASE_PHASES = {
    "pre-alpha": FOCUS_PRE_ALPHA_EXPORT,
    "alpha": FOCUS_ALPHA_EXPORT,
    "beta": FOCUS_BETA_EXPORT,
}

def expand_release_targets(targets):
    """Expand release phase targets (pre-alpha, alpha, beta) to service lists."""
    expanded = []
    for target in targets:
        target_lower = target.lower()
        if target_lower in RELEASE_PHASES:
            phase_services = RELEASE_PHASES[target_lower]
            for svc in phase_services:
                expanded.append(svc)
        else:
            expanded.append(target)
    return expanded

def _get_resources_for_domain(domain_name):
    """Get resource names (backend, frontend) for a domain from APP_RESOURCES.
    
    Returns both the actual service resources and YAML tracking resources.
    Library resources (appType == 'library') only return YAML resources.
    
    Matches by stack name (domain) which is the canonical service identifier.
    """
    resources = []
    for service in get_app_resources_ref():
        # Match by stack name (domain) - this is the canonical identifier in spec.master
        service_stack = service.get("stack", "")
        service_name = service.get("name", "")
        if service_stack == domain_name or service_name == domain_name:
            for res in service.get("resources", []):
                res_name = res.get("name", "")
                if res_name:
                    # Check if this is a library resource - libraries don't have runtime resources
                    manifest = res.get("_manifest", {})
                    if manifest.get("appType") == "library":
                        # For libraries, only add YAML tracking resource
                        resources.append(res_name + "-yaml")
                    else:
                        # For actual services (backend, frontend), add both:
                        # 1. The actual service resource (for docker_build/docker_compose)
                        resources.append(res_name)
                        # 2. The YAML tracking resource
                        resources.append(res_name + "-yaml")
    return resources


def get_all_needed_services(targets, skip_frontend = False):
    needed = {}
    visited = {}

    def _resolve_alias(resource_name):
        if resource_name in get_resource_aliases_ref():
            alias_value = get_resource_aliases_ref()[resource_name]
            # get_resource_aliases_ref() maps names to paths (strings), not to resource lists
            # Only return alias_value if it's a list (of resource names)
            if type(alias_value) == "list":
                return alias_value
        return [resource_name]

    def _filter_frontends(resources, include_frontends):
        if include_frontends:
            return resources
        return [resource for resource in resources if "frontend" not in resource]

    def resolve_target(resource_name):
        # Explicit focus targets keep their frontends unless --no-frontend is set.
        return _filter_frontends(_resolve_alias(resource_name), not skip_frontend)

    def resolve_dependency(resource_name):
        # Transitive domain dependencies should not pull dependency UIs.
        return _filter_frontends(_resolve_alias(resource_name), False)

    def discover(service):
        if service in visited:
            return
        visited[service] = True

        if skip_frontend and "frontend" in service:
            return

        needed[service] = True

        deps = get_resource_dependencies_ref().get(service, [])
        for dep in deps:
            for resolved in resolve_dependency(dep):
                discover(resolved)

    for target in targets:
        for resolved in resolve_target(target):
            discover(resolved)

    # Expand any domain names in needed to their actual resources
    # e.g., "identity" -> ["identity-management-backend", "identity-management-frontend", ...]
    expanded_needed = {}
    for service in needed:
        resources = _get_resources_for_domain(service)
        if resources:
            for res in resources:
                expanded_needed[res] = True
        else:
            expanded_needed[service] = True

    return expanded_needed.keys()


def _load_focus_lists():
    """Load focus lists from project spec.master directly."""
    project_root = os.environ.get('TDK_PROJECT_ROOT', '')
    if not project_root:
        return ([], [], [])
    
    # Load from spec.master
    spec_paths = [
        project_root + "/.tdk/.tdk-out/spec.master",
        project_root + "/spec.master",
    ]
    
    for spec_path in spec_paths:
        check_cmd = "test -f '{}' && echo 'yes' || echo 'no'".format(spec_path)
        exists = str(local(check_cmd, quiet=True, echo_off=True)).strip() == 'yes'
        if exists:
            # Parse PRE_ALPHA_RESOURCES from spec.master
            pre_alpha = []
            alpha = []
            beta = []
            
            content = str(local("cat '" + spec_path + "' 2>/dev/null || true", quiet=True, echo_off=True))
            
            # Simple parsing for PRE_ALPHA_RESOURCES = {"key": True, ...}
            if "PRE_ALPHA_RESOURCES" in content:
                start = content.find("PRE_ALPHA_RESOURCES = {")
                if start != -1:
                    start = content.find("{", start)
                    end = content.find("}", start)
                    if start != -1 and end != -1:
                        dict_content = content[start+1:end]
                        for line in dict_content.split("\n"):
                            line = line.strip()
                            if line and not line.startswith("#"):
                                # Extract key from "key": True format
                                if '"' in line or "'" in line:
                                    quote_char = '"' if '"' in line else "'"
                                    key_start = line.find(quote_char)
                                    key_end = line.find(quote_char, key_start + 1)
                                    if key_start != -1 and key_end != -1:
                                        key = line[key_start+1:key_end]
                                        if "True" in line:
                                            pre_alpha.append(key)
            
            if "ALPHA_RESOURCES" in content:
                start = content.find("ALPHA_RESOURCES = {")
                if start != -1:
                    start = content.find("{", start)
                    end = content.find("}", start)
                    if start != -1 and end != -1:
                        dict_content = content[start+1:end]
                        for line in dict_content.split("\n"):
                            line = line.strip()
                            if line and not line.startswith("#"):
                                if '"' in line or "'" in line:
                                    quote_char = '"' if '"' in line else "'"
                                    key_start = line.find(quote_char)
                                    key_end = line.find(quote_char, key_start + 1)
                                    if key_start != -1 and key_end != -1:
                                        key = line[key_start+1:key_end]
                                        if "True" in line:
                                            alpha.append(key)
            
            if "BETA_RESOURCES" in content:
                start = content.find("BETA_RESOURCES = {")
                if start != -1:
                    start = content.find("{", start)
                    end = content.find("}", start)
                    if start != -1 and end != -1:
                        dict_content = content[start+1:end]
                        for line in dict_content.split("\n"):
                            line = line.strip()
                            if line and not line.startswith("#"):
                                if '"' in line or "'" in line:
                                    quote_char = '"' if '"' in line else "'"
                                    key_start = line.find(quote_char)
                                    key_end = line.find(quote_char, key_start + 1)
                                    if key_start != -1 and key_end != -1:
                                        key = line[key_start+1:key_end]
                                        if "True" in line:
                                            beta.append(key)
            
            return (pre_alpha, alpha, beta)
    
    return ([], [], [])


def apply_focus_filter(cfg):
    # Ensure discovery is complete before applying focus filter
    if len(get_app_resources_ref()) == 0:
        get_app_resources()

    focus_targets = cfg.get("focus", [])

    # Default to pre-alpha if no focus targets specified
    if not focus_targets:
        print("🎯 Mode: pre-alpha (use --focus for alpha/beta)")
        focus_targets = ["pre-alpha"]

    parsed_targets = []
    for target in focus_targets:
        parsed_targets.extend(target.split(","))
    parsed_targets = [t.strip() for t in parsed_targets if t.strip()]
    
    # Load focus lists directly from spec.master (since env var is set after module load)
    pre_alpha_list, alpha_list, beta_list = _load_focus_lists()
    
    # Temporarily override RELEASE_PHASES with loaded values
    dynamic_phases = {
        "pre-alpha": pre_alpha_list if pre_alpha_list else FOCUS_PRE_ALPHA_EXPORT,
        "alpha": alpha_list if alpha_list else FOCUS_ALPHA_EXPORT,
        "beta": beta_list if beta_list else FOCUS_BETA_EXPORT,
    }
    
    # Expand release phase targets (pre-alpha, alpha, beta) to service lists
    expanded = []
    for target in parsed_targets:
        target_lower = target.lower()
        if target_lower in dynamic_phases:
            phase_services = dynamic_phases[target_lower]
            for svc in phase_services:
                expanded.append(svc)
        else:
            expanded.append(target)
    parsed_targets = expanded

    if not parsed_targets:
        return (False, None, None)

    print("🎯 ═══════════════════════════════════════════════════════════════")
    print("🎯  UBER-STYLE FOCUS MODE ACTIVATED")
    print("🎯  Target services: " + ", ".join(parsed_targets))
    print("🎯 ═══════════════════════════════════════════════════════════════")

    skip_frontend = cfg.get("no-frontend", False)
    include_monitoring = cfg.get("include-monitoring", False)

    needed_list = get_all_needed_services(parsed_targets, skip_frontend)
    needed = {}
    for s in needed_list:
        needed[s] = True

    for infra in CORE_INFRA_EXPORT:
        needed[infra] = True
        if infra in INFRA_STACK_MAP_EXPORT:
            needed[INFRA_STACK_MAP_EXPORT[infra]] = True

    if include_monitoring:
        needed["monitoring"] = True
        for svc in OPTIONAL_INFRA_EXPORT.get("monitoring", []):
            needed[svc] = True

    if os.environ.get("INFISICAL_ENABLED", "true").lower() == "true":
        needed["infisical"] = True
        for svc in OPTIONAL_INFRA_EXPORT.get("infisical", []):
            needed[svc] = True

    for target in parsed_targets:
        if target in get_resource_aliases_ref():
            needed[target] = True

    all_needed = needed.keys()

    logic_toggles = [
        "database-management",
        "golden-image",
        "proxy",
        "verdaccio",
        "infisical",
        "monitoring",
        "elk",
        "debezium",
        # Domains are auto-discovered from service manifests
        # No hardcoded domain names - all from service.json
        "backends-only",
    ]
    # Infrastructure resources that exist as Tilt local_resource or docker_compose
    # These are handled separately and should not be in resource_only_needed
    infra_resource_names = CORE_INFRA_EXPORT + ["infisical-db", "infisical-redis"]
    for opt_infra_list in OPTIONAL_INFRA_EXPORT.values():
        for res in opt_infra_list:
            if res not in infra_resource_names:
                infra_resource_names.append(res)
    
    # config.set_enabled_resources accepts only concrete Tilt resources.
    # Logic toggles (e.g. "golden-image", "database-management") are excluded since they're config flags, not resources.
    # Infrastructure resources (postgres, nats, traefik, etc.) are loaded via Infra.load_all()
    # and excluded here since they may not be available in all projects.
    # Only include resources that exist as discovered services.
    #
    # NOTE: resource_aliases (from get_resource_aliases_ref()) only maps top-level
    # STACK/domain names (e.g. "app", "billing") to a path - it does not contain an
    # entry per concrete resource (e.g. "dashboard-api", "checkout-app"). _get_resources_for_domain()
    # already expanded stack names into concrete resource names above (all_needed), so those
    # concrete names must be recognized here too, or they get silently dropped and their
    # services never start. Build that set directly from the discovered service resources.
    resource_aliases = get_resource_aliases_ref()
    known_service_resource_names = {}
    for _svc in get_app_resources_ref():
        for _res in _svc.get("resources", []):
            _res_name = _res.get("name", "")
            if _res_name:
                known_service_resource_names[_res_name] = True
                known_service_resource_names[_res_name + "-yaml"] = True
    resource_only_needed = []
    for r in all_needed:
        if r in logic_toggles:
            continue
        if r not in resource_aliases and r not in known_service_resource_names:
            continue
        resource_only_needed.append(r)

    print("🎯 Discovered " + str(len(all_needed)) + " entities via dependency graph:")

    app_resources = [r for r in all_needed if any([x in r for x in ["backend", "frontend", "migrator"]])]
    infra_resources = [r for r in all_needed if r in CORE_INFRA_EXPORT or any([r in v for v in OPTIONAL_INFRA_EXPORT.values()])]
    db_resources = [r for r in all_needed if "provision-db" in r]

    if app_resources:
        print("   📱 Apps: " + ", ".join(sorted(app_resources)))
    if db_resources:
        print("   🗃️  Databases: " + ", ".join(sorted(db_resources)))
    if infra_resources:
        print("   🏗️  Infrastructure: " + ", ".join(sorted(infra_resources)))

    print("🎯 ═══════════════════════════════════════════════════════════════")

    return (True, all_needed, resource_only_needed)


def create_should_enable_wrapper(focus_mode, focus_enabled_all, cfg, defaults):
    def should_enable_wrapper(resource_name):
        if focus_mode and focus_enabled_all:
            # Check if resource_name itself is in the list (for infrastructure)
            if resource_name in focus_enabled_all:
                return True
            # Check if resource_name starts with any domain in focus_enabled_all
            # e.g., "identity-management-backend" starts with "identity"
            for domain in focus_enabled_all:
                if resource_name.startswith(domain + "-"):
                    return True
            # Check get_resource_aliases_ref() (if it maps to resource lists)
            if resource_name in get_resource_aliases_ref():
                alias_value = get_resource_aliases_ref()[resource_name]
                if type(alias_value) == "list":
                    return any([res in focus_enabled_all for res in alias_value])
            return False
        return Utils.should_enable(resource_name, cfg, defaults)

    return should_enable_wrapper


Focus = struct(
    get_needed_services = get_all_needed_services,
    apply_focus = apply_focus_filter,
    create_enabler = create_should_enable_wrapper,
)


# Inlined constant
DEFAULTS = {}
