# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📦 TILT SDK - LIBRARY RESOURCE DEFINITION
# =============================================================================

load("../../platform/docker/constants.star", "PlatformDockerConstants")


def _library_needs_vite(path):
    """Check if a library needs a Vite config."""
    pkg_content = read_file(path + '/package.json', default='')
    if not pkg_content:
        return False

    pkg = decode_json(pkg_content)
    if not pkg:
        return False

    deps = {}
    for dep_type in ['dependencies', 'devDependencies', 'peerDependencies']:
        deps.update(pkg.get(dep_type, {}))

    needs_vite = 'vitest' in deps or 'vite-plugin-dts' in deps or 'vite' in deps
    if needs_vite:
        print("   🔍 Library at " + path + " needs Vite")
    return needs_vite


def _library_has_react(path):
    """Check if a library has React components."""
    pkg_content = read_file(path + '/package.json', default='')
    if not pkg_content:
        return False

    pkg = decode_json(pkg_content)
    if not pkg:
        return False

    deps = {}
    for dep_type in ['dependencies', 'devDependencies', 'peerDependencies']:
        deps.update(pkg.get(dep_type, {}))

    return 'react' in deps or '@vitejs/plugin-react' in deps


def _library_has_dts(path):
    """Check if a library has vite-plugin-dts in dependencies."""
    pkg_content = read_file(path + '/package.json', default='')
    if not pkg_content:
        return False

    pkg = decode_json(pkg_content)
    if not pkg:
        return False

    deps = {}
    for dep_type in ['dependencies', 'devDependencies', 'peerDependencies']:
        deps.update(pkg.get(dep_type, {}))

    return 'vite-plugin-dts' in deps


def library_is_frontend(path):
    """Check if library is marked as frontend in manifest or has React."""
    # Check library manifest (libraries use their own naming convention)
    lib_name = path.split('/')[-1]
    manifest_content = read_file(path + '/' + lib_name + '.manifest.json', default='')
    
    return _library_has_react(path)


def define_library_resource(ctx, name, path, labels, internal_deps=None, consumer_paths=None, write_fn=None, generate_vite_fn=None):
    """Defines a Tilt local_resource for a library with proper dependency management.

    Args:
        ctx: Tilt context with global_config, verdaccio_url, etc.
        name: Library name
        path: Path to library directory
        labels: Labels for Tilt UI organization
        internal_deps: Optional list of internal dependencies
        consumer_paths: Optional list of consumer resource paths
        write_fn: Optional write function for file generation
        generate_vite_fn: Optional Vite config generator function

    Returns:
        str: Name of created Tilt resource
    """
    global_config = ctx.get('global_config', {})
    registry = (
        ctx.get('verdaccio_url_docker')
        or global_config.get('verdaccio_url_docker')
        or ctx.get('verdaccio_url_local')
        or global_config.get('verdaccio_url_local')
        or PlatformDockerConstants.VERDACCIO_URL_DOCKER
    )
    internal_scope = ctx.get('internal_scope', '@tdk/')
    pkg_name = internal_scope + name

    if write_fn and generate_vite_fn:
        lib_manifest = {
            'appName': name,
            'appType': 'library',
            '_servicePath': path,
            'needsVite': True,
            'hasReact': _library_has_react(path),
            'hasDts': _library_has_dts(path),
        }

        if _library_needs_vite(path):
            print("   📚 Generating vite.config.ts for library: " + name)
            generate_vite_fn(lib_manifest, None, write_fn)

    consumer_paths_str = ''
    if consumer_paths:
        consumer_paths_str = ','.join(consumer_paths)

    publish_cmd = './engine/scripts/build-and-publish-lib.sh "' + path + '" "' + registry + '" "' + pkg_name + '" "' + consumer_paths_str + '"'

    # Sanitize name to remove invalid characters for Tilt resource names
    # e.g., "introvertic/ui" -> "introvertic-ui"
    resource_name = 'lib-' + name.replace('/', '-')
    auto_init_libs = os.environ.get('TILT_AUTO_INIT_LIBS', 'false').lower() == 'true'

    deps = [PlatformDockerConstants.VERDACCIO_RESOURCE_NAME]
    if internal_deps:
        for dep in internal_deps:
            if dep not in deps:
                deps.append(dep)

    input_deps = [
        path + '/src',
        path + '/package.json',
        path + '/tsconfig.json',
    ]

    local_resource(
        resource_name,
        cmd=publish_cmd,
        deps=input_deps,
        labels=labels + ['lib'],
        resource_deps=deps,
        allow_parallel=True,
        auto_init=auto_init_libs,
    )

    return resource_name


LibsResourceDefinition = struct(
    define_resource = define_library_resource,
    is_frontend = library_is_frontend,
)
