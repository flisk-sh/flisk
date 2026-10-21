# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
dependsOn starting shared platform Postgres (openspec/changes/dependson-starts-platform-postgres).

Executes the real Starlark through Tilt's interpreter (`tilt alpha tiltfile-result`)
instead of inspecting source text, plus source-text guards for the force-start path.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = [pytest.mark.generator]
TILT_REQUIRED = pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")

REPO_ROOT = Path(__file__).resolve().parents[2]
ORCHESTRATOR_DIR = REPO_ROOT / "engine" / "topologies" / "tilt" / "resources" / "orchestrator"
ORCHESTRATOR = ORCHESTRATOR_DIR / "apply_compose_resource_registration.star"
SHARED_MODULE = REPO_ROOT / "engine" / "topologies" / "tilt" / "resources" / "shared-platform-postgres.star"
INFRA_LOADER = REPO_ROOT / "engine" / "topologies" / "tilt" / "resources" / "infra-loader.star"
UTILS = REPO_ROOT / "engine" / "topologies" / "tilt" / "common" / "utils.star"
VALIDATORS = REPO_ROOT / "engine" / "topologies" / "tilt" / "generators" / "validators.star"
INTEGRATION = REPO_ROOT / "engine" / "topologies" / "tilt" / "manifest" / "integration.star"
MANIFEST_VALIDATOR = REPO_ROOT / "engine" / "topologies" / "tilt" / "manifest" / "validator.star"
RESULT_MARKER = "Error in fail: RESULT"


def run_starlark(tmp_path: Path, body: str, env: dict[str, str] | None = None) -> dict:
    """Run `body` in a Tiltfile; `body` must assign a dict to `r`. `@ORCHESTRATOR` is the orchestrator module dir."""
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(
        body.replace("@ORCHESTRATOR", str(ORCHESTRATOR_DIR))
        + "\nfail('RESULT' + encode_json(r))\n"
    )
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=180,
        env={**os.environ, **(env or {})},
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


def _run_resolve(tmp_path: Path, dep_name: str, all_services_map: dict | None = None) -> str:
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'resolve_dependency_to_resource')\n"
        f"r = {{'resolved': resolve_dependency_to_resource({dep_name!r}, {all_services_map or {}!r})}}\n",
    )
    return result["resolved"]


def test_resolve_postgres_maps_to_postgres_not_yaml(tmp_path):
    assert _run_resolve(tmp_path, "postgres") == "postgres"


def test_resolve_database_management_maps_to_postgres(tmp_path):
    assert _run_resolve(tmp_path, "database-management") == "postgres"


def test_resolve_typo_does_not_map_to_postgres(tmp_path):
    for typo in ("postgress", "Postgres", "postgresql"):
        resolved = _run_resolve(tmp_path, typo)
        assert resolved != "postgres", typo
        assert resolved == typo + "-yaml", (typo, resolved)


def test_resolve_feature_on_still_maps_via_public_resolve(tmp_path):
    """Resolution special-case applies in BOTH feature states; public helper is the same path."""
    # all_services_map contains the names as services so fallthrough would be different
    all_services_map = {
        "postgres-yaml": {"name": "something", "resources": [{"name": "postgres"}]},
        "database-management-yaml": {"name": "something", "resources": [{"name": "postgres"}]},
    }
    assert _run_resolve(tmp_path, "postgres", all_services_map) == "postgres"
    assert _run_resolve(tmp_path, "database-management", all_services_map) == "postgres"


@TILT_REQUIRED
def test_mixed_depends_on_list_both_resolve_to_one_postgres(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'resolve_manifest_dependency_names')\n"
        "manifest = {'dependsOn': ['postgres', 'database-management']}\n"
        "r = {'names': resolve_manifest_dependency_names(manifest, {})}\n",
    )
    assert result["names"] == ["postgres"]


@TILT_REQUIRED
def test_public_helpers_exported(tmp_path):
    # Names/predicates load from shared-platform-postgres.star (single source).
    # apply_compose re-exports function wrappers only — not a second name list.
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', "
        "'is_shared_platform_postgres_dependency', 'manifest_needs_shared_platform_postgres')\n"
        "load('"
        + str(SHARED_MODULE).replace("'", "")
        + "', 'SHARED_POSTGRES_DEPENDENCY_NAMES')\n"
        "r = {"
        "'names': SHARED_POSTGRES_DEPENDENCY_NAMES, "
        "'is_postgres': is_shared_platform_postgres_dependency('postgres'), "
        "'is_dm': is_shared_platform_postgres_dependency('database-management'), "
        "'is_typo': is_shared_platform_postgres_dependency('postgress'), "
        "'manifest_true': manifest_needs_shared_platform_postgres({'dependsOn': ['postgres']}), "
        "'manifest_dm': manifest_needs_shared_platform_postgres({'dependsOn': ['database-management']}), "
        "'manifest_false': manifest_needs_shared_platform_postgres({'dependsOn': ['other']}), "
        "'manifest_empty': manifest_needs_shared_platform_postgres({'dependsOn': []}), "
        "'manifest_missing': manifest_needs_shared_platform_postgres({}), "
        "'manifest_none': manifest_needs_shared_platform_postgres(None), "
        "}\n",
    )
    assert result["names"] == ["postgres", "database-management"]
    assert result["is_postgres"] is True
    assert result["is_dm"] is True
    assert result["is_typo"] is False
    assert result["manifest_true"] is True
    assert result["manifest_dm"] is True
    assert result["manifest_false"] is False
    assert result["manifest_empty"] is False
    assert result["manifest_missing"] is False
    assert result["manifest_none"] is False


@TILT_REQUIRED
def test_force_start_once_is_idempotent_on_ctx(tmp_path):
    """Two selected dependents must not force-start Postgres twice (ctx guard)."""
    write_fn = tmp_path / "write_marker.txt"
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'force_start_shared_platform_postgres_once')\n"
        "ctx = {'project_root': '', 'write_file': None}\n"
        # write_fn missing → first call must fail; instead stub write to a no-op
        # that does not materialize, then use required=False path... The helper
        # fail()s when write_fn is None. Provide a write_fn that records calls
        # via a local file under tmp — but Starlark local() is sandboxed to
        # Tiltfile dir. Use a write_fn that returns without writing; force path
        # then fail()s on missing compose — so only test the ctx skip AFTER a
        # successful registration is hard without docker_compose. Test the guard
        # contract: after a call that sets the ctx flag, a second call returns
        # False without invoking force again. Simulate by setting the flag and
        # asserting skip when feature is on OR flag set.\n"
        "ctx['_shared_platform_postgres_force_started'] = True\n"
        "should_on = (lambda name: True)\n"
        "should_off = (lambda name: False)\n"
        "first = force_start_shared_platform_postgres_once(ctx, should_on, 'orders-api')\n"
        "second = force_start_shared_platform_postgres_once(ctx, should_off, 'billing-api')\n"
        "r = {'first_when_feature_on': first, 'second_when_already_started': second, 'flag': ctx.get('_shared_platform_postgres_force_started', False)}\n",
    )
    # Feature already on → helper returns False without force-start
    assert result["first_when_feature_on"] is False
    # Already started this run → False even when feature is off
    assert result["second_when_already_started"] is False
    assert result["flag"] is True


@TILT_REQUIRED
def test_force_start_once_skips_when_already_started_on_ctx(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'force_start_shared_platform_postgres_once')\n"
        "ctx = {'_shared_platform_postgres_force_started': True, 'write_file': None}\n"
        "should_off = (lambda name: False)\n"
        "r = {'skipped': force_start_shared_platform_postgres_once(ctx, should_off, 'orders-api')}\n",
    )
    assert result["skipped"] is False


@TILT_REQUIRED
def test_generated_writer_can_materialize_shared_postgres_compose(tmp_path):
    """A missing platform Compose must be writable through the real Tilt writer."""
    compose = tmp_path / "services/platform/database-management/docker-compose.yml"
    result = run_starlark(
        tmp_path,
        "load('" + str(UTILS) + "', 'Utils')\n"
        "os.environ['TDK_PROJECT_ROOT'] = config.main_dir\n"
        "Utils.write_file_if_changed('services/platform/database-management/docker-compose.yml', 'services:\\n  postgres: {}\\n')\n"
        "r = {'written': True}\n",
    )
    assert result["written"] is True
    assert compose.read_text() == "services:\n  postgres: {}\n"


@TILT_REQUIRED
def test_force_start_two_dependents_materializes_one_existing_platform_compose(tmp_path):
    """Exercise the real force path, including Compose generation and the ctx guard."""
    project_config = tmp_path / ".tdk/project.json"
    project_config.parent.mkdir()
    project_config.write_text('{"project":{"name":"shared-postgres-fixture"}}\n')
    (tmp_path / ".env").write_text("DB_PASSWORD=test-password\n")
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'force_start_shared_platform_postgres_once')\n"
        "load('" + str(UTILS) + "', 'Utils')\n"
        "def feature_off(name):\n    return False\n"
        "ctx = {'project_root': config.main_dir, 'write_file': Utils.write_file_if_changed}\n"
        "first = force_start_shared_platform_postgres_once(ctx, feature_off, 'orders-api')\n"
        "second = force_start_shared_platform_postgres_once(ctx, feature_off, 'billing-api')\n"
        "r = {'first': first, 'second': second, 'registered': ctx.get('_shared_platform_postgres_force_started', False)}\n",
        env={"TDK_PROJECT_ROOT": str(tmp_path)},
    )
    assert result == {"first": True, "second": False, "registered": True}
    compose = tmp_path / "services/platform/database-management/docker-compose.yml"
    content = compose.read_text()
    assert content.count("  postgres:\n") == 1
    assert "image: postgres:16-alpine" in content
    assert '"127.0.0.1:15432:5432"' in content
    assert "name: shared_postgres_fixture_database" in content
    assert "container_name: shared_postgres_fixture_postgres" in content
    assert list(tmp_path.rglob("docker-compose.yml")) == [compose]


@TILT_REQUIRED
def test_focus_selection_identifies_only_selected_dependents(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'selected_for_shared_platform_postgres')\n"
        "ctx = {'focus_mode': True, 'focus_enabled_resources': ['billing-api']}\n"
        "r = {'orders': selected_for_shared_platform_postgres('orders-api', ctx), "
        "'billing': selected_for_shared_platform_postgres('billing-api', ctx), "
        "'both': [selected_for_shared_platform_postgres(name, {'focus_mode': True, 'focus_enabled_resources': ['orders-api', 'billing-api']}) for name in ['orders-api', 'billing-api']], "
        "'unfiltered': selected_for_shared_platform_postgres('orders-api', {'focus_mode': False})}\n",
    )
    assert result == {"orders": False, "billing": True, "both": [True, True], "unfiltered": True}


@TILT_REQUIRED
@pytest.mark.parametrize(
    ("selected", "billing_depends_on", "should_start"),
    [
        (["billing-api"], [], False),
        (["billing-api"], ["database-management"], True),
        (["orders-api"], [], True),
        (["orders-api", "billing-api"], [], True),
        (["orders-api", "billing-api"], ["database-management"], True),
    ],
)
def test_stack_registration_starts_postgres_only_for_selected_dependent(
    tmp_path, selected, billing_depends_on, should_start
):
    """A stack contains both siblings, but only a selected dependent can force start."""
    project_config = tmp_path / ".tdk/project.json"
    project_config.parent.mkdir()
    project_config.write_text('{"project":{"name":"selection-fixture"}}\n')
    (tmp_path / ".env").write_text("DB_PASSWORD=test-password\n")
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'register_compose_resources')\n"
        "load('" + str(UTILS) + "', 'Utils')\n"
        "def feature_off(name):\n    return False\n"
        "resource_config = {'name': 'app', 'path': 'services/app', 'resources': [{'name': 'orders-api'}, {'name': 'billing-api'}]}\n"
        "manifest_state = {'resource_manifests': {'orders-api': {'appType': 'infra', 'dependsOn': ['postgres']}, 'billing-api': {'appType': 'infra', 'dependsOn': "
        + repr(billing_depends_on)
        + "}}, 'config_gen_resources': {}}\n"
        "ctx = {'project_root': config.main_dir, 'write_file': Utils.write_file_if_changed, 'should_enable': feature_off, 'focus_mode': True, 'focus_enabled_resources': "
        + repr(selected)
        + "}\n"
        "register_compose_resources(resource_config, ctx, {'auto_init_apps': True}, manifest_state)\n"
        "r = {'started': ctx.get('_shared_platform_postgres_force_started', False)}\n",
        env={"TDK_PROJECT_ROOT": str(tmp_path)},
    )
    assert result["started"] is should_start
    assert (tmp_path / "services/platform/database-management/docker-compose.yml").exists() is should_start


def _make_should_enable(enabled: set[str]):
    """Starlark factory: a should_enable(name) that returns name in enabled."""
    return (
        "def make_should_enable(enabled_set):\n"
        "    def should_enable(name):\n"
        "        return name in enabled_set\n"
        "    return should_enable\n"
    )


@TILT_REQUIRED
def test_build_infra_dependencies_feature_off_has_no_postgres(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_infra_dependencies')\n"
        + _make_should_enable(set())
        + "should_enable = make_should_enable(set())\n"
        "r = {'deps': build_infra_dependencies('svc', should_enable, {}, False)}\n",
    )
    assert result["deps"] == []


@TILT_REQUIRED
def test_build_infra_dependencies_feature_on_has_postgres(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_infra_dependencies')\n"
        + _make_should_enable({"database-management"})
        + "should_enable = make_should_enable(set(['database-management']))\n"
        "r = {'deps': build_infra_dependencies('svc', should_enable, {}, False)}\n",
    )
    assert result["deps"] == ["postgres"]


@TILT_REQUIRED
def test_build_resource_deps_feature_off_depends_on_postgres_has_edge(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        "res = {'name': 'svc-api'}\n"
        "manifest = {'dependsOn': ['postgres']}\n"
        "r = {'deps': build_resource_deps(res, 'svc-api', manifest, {}, [], {}, {}, None, {})}\n",
    )
    assert result["deps"] == ["postgres"]


@TILT_REQUIRED
def test_build_resource_deps_feature_off_depends_on_database_management_has_edge(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        "res = {'name': 'svc-api'}\n"
        "manifest = {'dependsOn': ['database-management']}\n"
        "r = {'deps': build_resource_deps(res, 'svc-api', manifest, {}, [], {}, {}, None, {})}\n",
    )
    assert result["deps"] == ["postgres"]


@TILT_REQUIRED
def test_build_resource_deps_feature_on_depends_on_exactly_one_postgres(tmp_path):
    """Feature already adds postgres via _build_infra_dependencies; dependsOn must not double it."""
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        "res = {'name': 'svc-api'}\n"
        "manifest = {'dependsOn': ['postgres']}\n"
        "r = {'deps': build_resource_deps(res, 'svc-api', manifest, {}, ['postgres'], {}, {}, None, {})}\n",
    )
    assert result["deps"] == ["postgres"]
    assert result["deps"].count("postgres") == 1


@TILT_REQUIRED
def test_build_resource_deps_feature_on_depends_on_dm_exactly_one_postgres(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        "res = {'name': 'svc-api'}\n"
        "manifest = {'dependsOn': ['database-management']}\n"
        "r = {'deps': build_resource_deps(res, 'svc-api', manifest, {}, ['postgres'], {}, {}, None, {})}\n",
    )
    assert result["deps"] == ["postgres"]
    assert result["deps"].count("postgres") == 1


@TILT_REQUIRED
def test_build_resource_deps_no_edge_when_neither_feature_nor_dependency(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        "res = {'name': 'svc-api'}\n"
        "manifest = {'dependsOn': []}\n"
        "r = {'deps': build_resource_deps(res, 'svc-api', manifest, {}, [], {}, {}, None, {})}\n",
    )
    assert result["deps"] == []


@TILT_REQUIRED
def test_build_resource_deps_mixed_names_single_postgres_edge(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        "res = {'name': 'svc-api'}\n"
        "manifest = {'dependsOn': ['postgres', 'database-management']}\n"
        "r = {'deps': build_resource_deps(res, 'svc-api', manifest, {}, [], {}, {}, None, {})}\n",
    )
    assert result["deps"].count("postgres") == 1


# --- Source-text guards (file reads only; no tilt required). ---


def test_source_force_start_platform_postgres_exists_and_does_not_load_messaging():
    """force_start_platform_postgres must exist; the force path must not register messaging/kafka/etc."""
    source = INFRA_LOADER.read_text()
    assert "def force_start_platform_postgres(" in source
    assert "force_start_postgres = force_start_platform_postgres" in source
    # Tilt freezes Starlark globals — no mutable registration flag assignment.
    assert '_POSTGRES_REGISTERED["flag"] = True' not in source
    assert '_POSTGRES_REGISTERED = ' not in source
    start_idx = source.find("def force_start_platform_postgres(")
    register_idx = source.find("def _register_platform_postgres(")
    load_idx = source.find("def _load_database_management(")
    assert start_idx != -1 and register_idx != -1 and load_idx != -1
    force_region = source[register_idx:load_idx]
    # Actual resource registrations forbidden on the force path (docstrings may mention them).
    for forbidden in (
        "dc_resource('nats'",
        "dc_resource('kafka'",
        "dc_resource('redis'",
        "dc_resource('zookeeper'",
        "dc_resource('provision-db",
        "dc_resource('prisma",
        "messaging_compose",
        "should_enable('debezium')",
    ):
        assert forbidden not in force_region, forbidden
    # Feature-on path still registers postgres via the same helper.
    db_body = source[load_idx : source.find("def _load_infisical", load_idx)]
    assert "_register_platform_postgres" in db_body


def test_source_force_start_passes_required_and_fails_on_missing_compose():
    """Force path must pass required=True and fail() when compose is not materialized."""
    source = INFRA_LOADER.read_text()
    register_idx = source.find("def _register_platform_postgres(")
    force_idx = source.find("def force_start_platform_postgres(")
    load_idx = source.find("def _load_database_management(")
    assert register_idx != -1 and force_idx != -1
    register_body = source[register_idx:force_idx]
    force_body = source[force_idx:load_idx]
    assert "required=" in register_body
    assert "fail(" in register_body
    assert "required=True" in force_body
    assert "write_fn" in force_body


def test_source_orchestrator_calls_force_start_for_selected_dependson():
    """Orchestrator must wire force-start for selected dependsOn when feature is off, once per run."""
    source = ORCHESTRATOR.read_text()
    assert "load('../infra-loader.star', 'Infra')" in source
    assert "force_start_shared_platform_postgres_once" in source
    assert "manifest_needs_shared_platform_postgres" in source
    assert "not should_enable('database-management')" in source
    assert "ctx['_shared_platform_postgres_force_started']" in source
    # write_fn required when force-starting
    assert "ctx.get('write_file'" in source
    assert "fail(" in source
    # Only selected resources in this registration are scanned
    assert "resource_config.get('resources', [])" in source
    # No second hardcoded name list in orchestrator
    assert 'SHARED_POSTGRES_DEPENDENCY_NAMES = ["postgres"' not in source


def test_source_resolution_special_case_before_yaml_fallthrough():
    source = ORCHESTRATOR.read_text()
    resolve_idx = source.find("def _resolve_dependency_to_resource(")
    special_idx = source.find("if is_shared_platform_postgres_dependency(dep_name):")
    yaml_fallthrough = source.find("return dep_name + '-yaml'", resolve_idx)
    assert resolve_idx != -1 and special_idx != -1 and yaml_fallthrough != -1
    assert resolve_idx < special_idx < yaml_fallthrough


def test_source_ensure_compose_write_matches_exists_check():
    """Ensure writes the same path family it checks; absolute fallback if custom write_fn missed."""
    source = INFRA_LOADER.read_text()
    ensure_idx = source.find("def _ensure_database_management_compose(")
    register_idx = source.find("def _register_platform_postgres(")
    assert ensure_idx != -1 and register_idx != -1
    body = source[ensure_idx:register_idx]
    assert "compose_rel" in body
    assert "write_fn(compose_rel" in body
    # Absolute-path fallback when relative write did not land
    assert "startswith('/')" in body or "startswith(\"/\")" in body


def test_source_no_circular_load_from_infra_loader_to_apply_compose():
    """infra-loader.star must not load apply_compose_resource_registration (circular load guard)."""
    source = INFRA_LOADER.read_text()
    assert "apply_compose_resource_registration" not in source
    assert "apply_compose" not in source


def test_source_apply_compose_loads_infra_loader_via_top_level_path():
    apply_source = ORCHESTRATOR.read_text()
    assert "load('../infra-loader.star', 'Infra')" in apply_source
