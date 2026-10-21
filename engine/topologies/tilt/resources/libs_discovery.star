# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔍 TILT SDK - LIBRARY DEPENDENCY DISCOVERY
# =============================================================================

load('./libs_paths.star', 'LibsPaths')

_get_lib_path_from_package_name = LibsPaths.get_path
_read_package_json_deps = LibsPaths.read_package_json_deps


def discover_resource_libraries(ctx, resource_paths, max_depth=10):
    """
    Recursively discovers all internal library dependencies for given service paths.

    Returns:
        Dict of {package_name: {'name': str, 'path': str, 'label': str, 'tilt_resource': str}}
    """
    needed_libs = {}
    visited = {}

    queue = []
    for resource_path in resource_paths:
        pkg_path = resource_path + '/package.json'
        queue.append((pkg_path, 0))

    iteration = 0
    max_iterations = 1000

    while len(queue) > 0 and iteration < max_iterations:
        iteration = iteration + 1

        current = queue[0]
        queue = queue[1:]

        pkg_path = current[0]
        depth = current[1]

        if pkg_path in visited:
            continue
        visited[pkg_path] = True

        if depth > max_depth:
            continue

        internal_deps = _read_package_json_deps(ctx, pkg_path)

        for dep_name in internal_deps:
            if dep_name in needed_libs:
                continue

            lib_info = _get_lib_path_from_package_name(ctx, dep_name)
            lib_path = lib_info[0]
            lib_label = lib_info[1]
            tilt_resource = lib_info[2]

            if lib_path == None:
                continue

            lib_name = lib_path.split('/')[-1]
            lib_internal_deps = _read_package_json_deps(ctx, lib_path + '/package.json')

            needed_libs[dep_name] = {
                'name': lib_name,
                'path': lib_path,
                'label': lib_label,
                'package_name': dep_name,
                'tilt_resource': tilt_resource,
                'internal_deps': lib_internal_deps,
            }

            lib_pkg_path = lib_path + '/package.json'
            if lib_pkg_path not in visited:
                queue.append((lib_pkg_path, depth + 1))

    return needed_libs


def discover_dependencies_from_json(ctx, resource_path):
    """
    Discovers library dependencies for a SINGLE service from its package.json.

    Returns:
        List of Tilt resource names: ['lib-platform-...', ...]
    """
    pkg_path = resource_path + '/package.json'
    internal_deps = _read_package_json_deps(ctx, pkg_path)

    tilt_resources = []
    for dep_name in internal_deps:
        lib_info = _get_lib_path_from_package_name(ctx, dep_name)
        tilt_resource = lib_info[2]

        if tilt_resource != None and tilt_resource not in tilt_resources:
            tilt_resources.append(tilt_resource)

    return tilt_resources


LibsDiscovery = struct(
    discover_resource_libs = discover_resource_libraries,
    discover_deps_from_json = discover_dependencies_from_json,
)
