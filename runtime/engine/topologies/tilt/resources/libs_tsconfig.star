# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🎯 TILT SDK - LIBRARY TSCONFIG FACTORY
# =============================================================================

load('./libs_resource_definition.star', 'LibsResourceDefinition')

_library_is_frontend = LibsResourceDefinition.is_frontend


def make_smart_tsconfig_generator(tsconfig_provider, write_fn):
    """
    Factory function that creates a smart tsconfig generator.
    Detects if a library is frontend (manifest or has React) and uses appropriate tsconfig.

    Args:
        tsconfig_provider: Provider with library_frontend and library_backend methods
        write_fn: Write function for file output

    Returns:
        function: Config generator function taking (path, deps)
    """
    def generate_tsconfig(path, deps=None):
        is_frontend = _library_is_frontend(path)

        if is_frontend:
            tsconfig_provider.library_frontend(path, write_fn, internal_deps=deps, is_docker=True)
            tsconfig_provider.library_frontend(path, write_fn, internal_deps=deps, is_docker=False)
        else:
            tsconfig_provider.library_backend(path, write_fn, internal_deps=deps, is_docker=True)
            tsconfig_provider.library_backend(path, write_fn, internal_deps=deps, is_docker=False)

    return generate_tsconfig


LibsTSConfig = struct(
    make_smart_tsconfig = make_smart_tsconfig_generator,
)
