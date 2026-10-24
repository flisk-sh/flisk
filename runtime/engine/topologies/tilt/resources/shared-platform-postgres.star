# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🐘 SHARED PLATFORM POSTGRES dependsOn ALIASES
# =============================================================================
# `postgres` and `database-management` mean the one shared platform Postgres
# Tilt resource. They are not app services and must not be reported as missing
# by manifest validators. The engine resolver maps both to `postgres`.
# Spec: openspec/changes/dependson-starts-platform-postgres
# =============================================================================

SHARED_POSTGRES_DEPENDENCY_NAMES = ["postgres", "database-management"]


def is_shared_platform_postgres_dependency(name):
    """True when a dependsOn name is one of the shared platform Postgres aliases."""
    return name in SHARED_POSTGRES_DEPENDENCY_NAMES


def manifest_needs_shared_platform_postgres(manifest):
    """True when a manifest's dependsOn lists postgres or database-management."""
    if type(manifest) != 'dict':
        return False
    deps = manifest.get('dependsOn')
    if not deps or type(deps) != 'list':
        return False
    for dep in deps:
        if is_shared_platform_postgres_dependency(dep):
            return True
    return False
