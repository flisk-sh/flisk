# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🚀 TILT SDK - LIBRARY SETUP ORCHESTRATOR
# =============================================================================

load('./libs_paths.star', 'LibsPaths')
load('./libs_discovery.star', 'LibsDiscovery')
load('./libs_resource_definition.star', 'LibsResourceDefinition')
load('../../platform/docker/constants.star', 'PlatformDockerConstants')

_get_lib_path_from_package_name = LibsPaths.get_path
_read_package_json_deps = LibsPaths.read_package_json_deps
_get_resource_paths_for_focus = LibsPaths.get_resource_paths
_discover_resource_libraries = LibsDiscovery.discover_resource_libs
_define_library_resource = LibsResourceDefinition.define_resource


def setup_libraries(ctx, should_enable_fn, ddd_libs, platform_libs, product_libs, config_generators, focus_enabled_all=None):
    """
    Sets up library resources with dynamic dependency scanning.

    Returns:
        Dict mapping package_name -> tilt_resource_name
    """
    library_map = {}
    internal_scope = ctx.get('internal_scope', '@flisk/')
    library_roots = ctx.get('library_roots', {})
    print("📚 setup_libraries called for " + str(len(platform_libs) + len(product_libs) + len(ddd_libs)) + " potential libraries")

    generate_tsconfig = config_generators.get('tsconfig')
    generate_npmrc = config_generators.get('npmrc')
    generate_bunfig = config_generators.get('bunfig')
    generate_vite = config_generators.get('vite')
    write_fn = config_generators.get('write_fn')

    if not should_enable_fn(PlatformDockerConstants.VERDACCIO_RESOURCE_NAME):
        return library_map

    if focus_enabled_all != None:
        print("📚 Focus mode: Scanning service dependencies...")

        resource_paths = _get_resource_paths_for_focus(ctx, focus_enabled_all)

        if len(resource_paths) == 0:
            print("   ⚠️  No service paths found for focus targets")
            return library_map

        print("   🔍 Scanning " + str(len(resource_paths)) + " services")

        needed_libs = _discover_resource_libraries(ctx, resource_paths)

        if len(needed_libs) == 0:
            print("   ℹ️  No internal library dependencies found")
            return library_map

        platform_count = 0
        product_count = 0
        ddd_count = 0

        for pkg_name, lib_info in needed_libs.items():
            lib_name = lib_info['name']
            lib_path = lib_info['path']
            lib_label = lib_info['label']
            tilt_resource = lib_info['tilt_resource']
            internal_deps = lib_info.get('internal_deps', [])

            lib_res_deps = []
            lib_ts_deps = {}
            for dep_pkg in internal_deps:
                dep_info = _get_lib_path_from_package_name(ctx, dep_pkg)
                if dep_info[2]:
                    lib_res_deps.append(dep_info[2])
                    lib_ts_deps[dep_pkg] = dep_info[0]

            consumer_paths = []
            for resource_path in resource_paths:
                resource_internal_deps = _read_package_json_deps(ctx, resource_path + '/package.json')
                if pkg_name in resource_internal_deps:
                    consumer_paths.append(resource_path)

            if generate_npmrc:
                generate_npmrc(lib_path)
            if generate_bunfig:
                generate_bunfig(lib_path)
            if generate_tsconfig:
                generate_tsconfig(lib_path, lib_ts_deps)

            _define_library_resource(
                ctx,
                lib_name,
                lib_path,
                [lib_label],
                internal_deps=lib_res_deps,
                consumer_paths=consumer_paths,
                write_fn=write_fn,
                generate_vite_fn=generate_vite,
            )
            library_map[pkg_name] = tilt_resource

            if lib_label == 'lib.platform':
                platform_count = platform_count + 1
            elif lib_label == 'lib.product':
                product_count = product_count + 1
            elif lib_label == 'lib.ddd':
                ddd_count = ddd_count + 1

        print("   ✅ Discovered " + str(len(needed_libs)) + " libraries (platform: " + str(platform_count) + ", product: " + str(product_count) + ", ddd: " + str(ddd_count) + ")")

    else:
        all_libs_info = {}

        for lib in ddd_libs:
            pkg_name = internal_scope + lib['name']
            lib_path = lib['path']
            all_libs_info[pkg_name] = {'name': lib['name'], 'path': lib_path, 'label': 'lib.ddd'}

        for lib_name in platform_libs:
            pkg_name = internal_scope + lib_name
            lib_path = library_roots.get('platform', 'shared-platform-engineering') + '/' + lib_name
            all_libs_info[pkg_name] = {'name': lib_name, 'path': lib_path, 'label': 'lib.platform'}

        for lib_name in product_libs:
            pkg_name = internal_scope + lib_name
            lib_path = library_roots.get('product', 'shared-product-engineering') + '/' + lib_name
            all_libs_info[pkg_name] = {'name': lib_name, 'path': lib_path, 'label': 'lib.product'}

        for pkg_name, lib_info in all_libs_info.items():
            lib_name = lib_info['name']
            lib_path = lib_info['path']
            lib_label = lib_info['label']

            internal_deps = _read_package_json_deps(ctx, lib_path + '/package.json')

            lib_res_deps = []
            lib_ts_deps = {}
            for dep_pkg in internal_deps:
                dep_info = _get_lib_path_from_package_name(ctx, dep_pkg)
                if dep_info[2]:
                    lib_res_deps.append(dep_info[2])
                    lib_ts_deps[dep_pkg] = dep_info[0]

            if generate_npmrc:
                generate_npmrc(lib_path)
            if generate_bunfig:
                generate_bunfig(lib_path)
            if generate_tsconfig:
                generate_tsconfig(lib_path, lib_ts_deps)

            _define_library_resource(
                ctx,
                lib_name,
                lib_path,
                [lib_label],
                internal_deps=lib_res_deps,
                write_fn=write_fn,
                generate_vite_fn=generate_vite,
            )
            library_map[pkg_name] = 'lib-' + lib_name

    return library_map


LibsSetup = struct(
    setup_all = setup_libraries,
)
