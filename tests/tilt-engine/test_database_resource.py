# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
A `database` resource (appType `database`, framework `postgres`) declares the shared
platform Postgres in a service.json (#2863). Its appName in dependsOn means the Tilt
resource `postgres`, it gets no container of its own, and it starts Postgres when the
database-management feature is off.

Executes the real Starlark through Tilt's interpreter (`tilt alpha tiltfile-result`).
"""

from __future__ import annotations

import pytest

from test_dependson_platform_postgres import (
    ORCHESTRATOR_DIR,
    SHARED_MODULE,
    TILT_REQUIRED,
    UTILS,
    run_starlark,
)

pytestmark = [pytest.mark.generator]

DB_MANIFEST = {"appName": "shop-db", "appType": "database", "framework": "postgres", "stack": "shop"}

# The shape _build_all_services_map gives the orchestrator: stack and resource names map to their service group.
SERVICES_MAP = {
    "shop": {
        "name": "shop",
        "stack": "shop",
        "resources": [
            {"name": "shop-db", "_manifest": DB_MANIFEST},
            {"name": "orders-api", "_manifest": {"appName": "orders-api", "appType": "backend", "stack": "shop"}},
        ],
    },
}
SERVICES_MAP["shop-db"] = SERVICES_MAP["shop"]
SERVICES_MAP["orders-api"] = SERVICES_MAP["shop"]


def _starlark_literal(value) -> str:
    """Python dict/list/str/bool literals are valid Starlark for this data."""
    return repr(value)


@TILT_REQUIRED
def test_a_database_resource_name_resolves_to_postgres(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'resolve_dependency_to_resource', 'resolve_dependency_to_resources')\n"
        f"services = {_starlark_literal(SERVICES_MAP)}\n"
        "r = {'one': resolve_dependency_to_resource('shop-db', services), "
        "'many': resolve_dependency_to_resources('shop-db', services), "
        "'backend': resolve_dependency_to_resources('orders-api', services)}\n",
    )
    assert result["one"] == "postgres"
    assert result["many"] == ["postgres"]
    # An ordinary service still resolves to itself.
    assert result["backend"] == ["orders-api"]


@TILT_REQUIRED
def test_a_service_depending_on_the_database_waits_for_postgres(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        f"services = {_starlark_literal(SERVICES_MAP)}\n"
        "res = {'name': 'orders-api-migrator'}\n"
        "manifest = {'dependsOn': ['shop-db']}\n"
        "r = {'off': build_resource_deps(res, 'orders-api-migrator', manifest, {}, [], {}, {}, None, services), "
        "'on': build_resource_deps(res, 'orders-api-migrator', manifest, {}, ['postgres'], {}, {}, None, services)}\n",
    )
    assert result["off"] == ["postgres"]
    # With the feature on, infra_deps already carries postgres: still exactly one edge, and no `shop-db` edge.
    assert result["on"] == ["postgres"]


@TILT_REQUIRED
def test_a_stack_dependency_does_not_wait_for_the_database_resource_itself(tmp_path):
    """A database resource has no Tilt resource, so depending on its stack must not name it."""
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'resolve_dependency_to_resources')\n"
        f"services = {_starlark_literal(SERVICES_MAP)}\n"
        "r = {'stack': resolve_dependency_to_resources('shop', services)}\n",
    )
    assert result["stack"] == ["orders-api"]


@TILT_REQUIRED
def test_database_manifests_and_their_dependents_need_the_shared_postgres(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'manifest_needs_shared_platform_postgres', 'database_resource_names')\n"
        "load('" + str(SHARED_MODULE) + "', 'is_database_manifest')\n"
        f"services = {_starlark_literal(SERVICES_MAP)}\n"
        f"db = {_starlark_literal(DB_MANIFEST)}\n"
        "r = {"
        "'names': database_resource_names(services), "
        "'is_db': is_database_manifest(db), "
        "'is_backend_db': is_database_manifest({'appType': 'backend'}), "
        "'db_itself': manifest_needs_shared_platform_postgres(db), "
        "'dependent': manifest_needs_shared_platform_postgres({'dependsOn': ['shop-db']}, ['shop-db']), "
        "'dependent_without_names': manifest_needs_shared_platform_postgres({'dependsOn': ['shop-db']}), "
        "'other': manifest_needs_shared_platform_postgres({'dependsOn': ['orders-api']}, ['shop-db']), "
        "}\n",
    )
    assert result == {
        "names": ["shop-db"],
        "is_db": True,
        "is_backend_db": False,
        "db_itself": True,
        "dependent": True,
        "dependent_without_names": False,
        "other": False,
    }


@TILT_REQUIRED
@pytest.mark.parametrize(
    ("selected", "should_start"),
    [
        (["shop-db"], True),
        (["orders-api"], True),
        (["billing-api"], False),
    ],
)
def test_a_selected_database_resource_or_dependent_starts_postgres_with_the_feature_off(
    tmp_path, selected, should_start
):
    project_config = tmp_path / ".flisk/project.json"
    project_config.parent.mkdir()
    project_config.write_text('{"project":{"name":"database-fixture"}}\n')
    (tmp_path / ".env").write_text("DB_PASSWORD=test-password\n")
    resource_config = {
        "name": "shop",
        "path": "services/shop",
        "resources": [{"name": "shop-db"}, {"name": "orders-api"}, {"name": "billing-api"}],
    }
    manifests = {
        "shop-db": DB_MANIFEST,
        "orders-api": {"appType": "infra", "dependsOn": ["shop-db"]},
        "billing-api": {"appType": "infra", "dependsOn": []},
    }
    all_services = [
        {
            "name": "shop",
            "stack": "shop",
            "resources": [{"name": name, "_manifest": manifest} for name, manifest in manifests.items()],
        }
    ]
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'register_compose_resources')\n"
        "load('" + str(UTILS) + "', 'Utils')\n"
        "def feature_off(name):\n    return False\n"
        f"resource_config = {_starlark_literal(resource_config)}\n"
        f"manifest_state = {{'resource_manifests': {_starlark_literal(manifests)}, 'config_gen_resources': {{}}}}\n"
        "ctx = {'project_root': config.main_dir, 'write_file': Utils.write_file_if_changed, 'should_enable': feature_off, "
        f"'focus_mode': True, 'focus_enabled_resources': {selected!r}, 'all_services': {_starlark_literal(all_services)}}}\n"
        "register_compose_resources(resource_config, ctx, {'auto_init_apps': True}, manifest_state)\n"
        "r = {'started': ctx.get('_shared_platform_postgres_force_started', False)}\n",
        env={"FLISK_PROJECT_ROOT": str(tmp_path)},
    )
    assert result["started"] is should_start
    assert (tmp_path / "services/platform/database-management/docker-compose.yml").exists() is should_start


def test_source_registration_skips_database_resources():
    """A database resource must never become an app container or a config-gen resource."""
    source = (ORCHESTRATOR_DIR / "apply_compose_resource_registration.star").read_text()
    assert "_UNREGISTERED_APP_TYPES = ['library', 'sdk', 'infra', 'database']" in source
    assert "if app_type in ['library', 'sdk', 'infra', 'database']:" in source
    manifest_orchestration = (ORCHESTRATOR_DIR / "apply_manifest_orchestration.star").read_text()
    assert "if app_type in ['library', 'sdk', 'infra', 'database']:" in manifest_orchestration
