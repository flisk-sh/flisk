# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📚 TILT SDK - LIBRARIES LIFECYCLE MODULE
# =============================================================================
# Purpose: Public API facade for library management modules.
# =============================================================================

load('./libs_paths.star', 'LibsPaths')
load('./libs_discovery.star', 'LibsDiscovery')
load('./libs_resource_definition.star', 'LibsResourceDefinition')
load('./libs_setup.star', 'LibsSetup')
load('./libs_tsconfig.star', 'LibsTSConfig')


Libs = struct(
    # Path resolution
    get_path = LibsPaths.get_path,

    # Dependency discovery
    discover_resource_libs = LibsDiscovery.discover_resource_libs,
    discover_deps_from_json = LibsDiscovery.discover_deps_from_json,
    get_resource_paths = LibsPaths.get_resource_paths,
    get_deps_mapping = LibsPaths.get_deps_mapping,

    # Resource definition
    define_resource = LibsResourceDefinition.define_resource,
    setup_all = LibsSetup.setup_all,

    # TSConfig factory
    make_smart_tsconfig = LibsTSConfig.make_smart_tsconfig,
)
