# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🐘 SHARED PLATFORM POSTGRES dependsOn ALIASES
# =============================================================================
# `postgres` and `database-management` mean the one shared platform Postgres
# Tilt resource. They are not app services and must not be reported as missing
# by manifest validators. The engine resolver maps both to `postgres`.
# A resource with appType `database` (framework `postgres`) declares that same
# Postgres in a service.json: its appName in dependsOn also maps to `postgres`.
# Spec: openspec/changes/dependson-starts-platform-postgres, issue #2863
# =============================================================================

SHARED_POSTGRES_DEPENDENCY_NAMES = ["postgres", "database-management"]

DATABASE_APP_TYPE = "database"


def is_database_manifest(manifest):
    """True when a manifest declares the project's database (appType `database`)."""
    return type(manifest) == 'dict' and manifest.get('appType') == DATABASE_APP_TYPE


def is_shared_platform_postgres_dependency(name):
    """True when a dependsOn name is one of the shared platform Postgres aliases."""
    return name in SHARED_POSTGRES_DEPENDENCY_NAMES


def manifest_needs_shared_platform_postgres(manifest, database_names=None):
    """True when a manifest is a database resource, or its dependsOn lists postgres, database-management or a database resource.

    `database_names` are the appNames of the project's `database` resources.
    """
    if type(manifest) != 'dict':
        return False
    if is_database_manifest(manifest):
        return True
    deps = manifest.get('dependsOn')
    if not deps or type(deps) != 'list':
        return False
    for dep in deps:
        if is_shared_platform_postgres_dependency(dep) or dep in (database_names or []):
            return True
    return False
