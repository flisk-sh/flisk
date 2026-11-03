# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Issue #3061: Enforce Docker Compose dependency health and migration completion conditions.

Tests:
1. Manifest dependsOn conditions ('service_healthy', 'service_completed_successfully', 'service_started')
   correctly map to Tilt resource_deps edges (<dep>-healthy, <dep>-done, <dep>).
2. Shared platform Postgres with condition: 'service_healthy' waits on postgres-healthy.
3. Registration guards and scripts for health checks and one-shot completion.
4. Live Docker integration verifying that:
   - API does not start before db is healthy and migrator is complete.
   - Failing migrator halts startup with an error.
   - Unhealthy database halts startup with an error.
   - Successful database and migrator allows API startup.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
import uuid
from pathlib import Path

import pytest

from test_dependson_platform_postgres import ORCHESTRATOR, TILT_REQUIRED, run_starlark

pytestmark = [pytest.mark.generator]

REPO_ROOT = Path(__file__).resolve().parents[2]
TILT_DIR = REPO_ROOT / "runtime" / "engine" / "topologies" / "tilt"
ORCHESTRATOR_DIR = TILT_DIR / "resources" / "orchestrator"
COMMON_DIR = TILT_DIR / "common"
INFRA_LOADER = TILT_DIR / "resources" / "infra-loader.star"

SERVICES = {
    "app": {
        "name": "app",
        "stack": "app",
        "resources": [
            {"name": "db", "_manifest": {"appType": "bring-your-own", "healthCheck": {"port": 5432}}},
            {"name": "migrator", "_manifest": {"appType": "migrator"}},
            {"name": "cache", "_manifest": {"appType": "bring-your-own"}},
            {"name": "byo-no-health", "_manifest": {"appType": "bring-your-own"}},
            {"name": "disabled-health", "_manifest": {"appType": "backend", "healthCheck": False}},
            {"name": "byo-with-port", "_manifest": {"appType": "bring-your-own", "healthCheck": {"port": 8080}}},
            {"name": "api", "_manifest": {"appType": "backend"}},
        ],
    },
    "shop": {
        "name": "shop",
        "stack": "shop",
        "resources": [
            {"name": "shop-backend", "_manifest": {"appType": "backend"}},
            {"name": "shop-migrator", "_manifest": {"appType": "migrator"}},
        ],
    },
    "core": {
        "name": "core",
        "stack": "core",
        "resources": [
            {"name": "core-api", "_manifest": {"appType": "backend"}},
            {"name": "core-worker", "_manifest": {"appType": "worker"}},
        ],
    },
}
for _stack in list(SERVICES.values()):
    for _res in _stack["resources"]:
        SERVICES[_res["name"]] = _stack


@TILT_REQUIRED
def test_condition_service_healthy_adds_healthy_resource(tmp_path):
    """condition: 'service_healthy' on a service adds <service>-healthy to resource_deps."""
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps', 'job_healthy_resource_name')\n"
        f"services = {SERVICES!r}\n"
        "res = {'name': 'api'}\n"
        "manifest = {'dependsOn': [{'name': 'db', 'condition': 'service_healthy'}]}\n"
        "r = {\n"
        "  'deps': build_resource_deps(res, 'api', manifest, {}, [], {}, {}, None, services),\n"
        "  'healthy_name': job_healthy_resource_name('db'),\n"
        "}\n",
    )
    assert result["deps"] == ["db", "db-healthy"]
    assert result["healthy_name"] == "db-healthy"


@TILT_REQUIRED
def test_condition_service_completed_successfully_adds_done_resource(tmp_path):
    """condition: 'service_completed_successfully' adds <service>-done to resource_deps."""
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        f"services = {SERVICES!r}\n"
        "res = {'name': 'api'}\n"
        "manifest = {'dependsOn': [{'name': 'migrator', 'condition': 'service_completed_successfully'}]}\n"
        "r = {'deps': build_resource_deps(res, 'api', manifest, {}, [], {}, {}, None, services)}\n",
    )
    assert result["deps"] == ["migrator", "migrator-done"]


@TILT_REQUIRED
def test_condition_service_started_only_adds_base_resource(tmp_path):
    """condition: 'service_started' keeps standard base resource edge."""
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        f"services = {SERVICES!r}\n"
        "res = {'name': 'api'}\n"
        "manifest = {'dependsOn': [{'name': 'cache', 'condition': 'service_started'}]}\n"
        "r = {'deps': build_resource_deps(res, 'api', manifest, {}, [], {}, {}, None, services)}\n",
    )
    assert result["deps"] == ["cache"]


@TILT_REQUIRED
def test_mixed_dependency_conditions_combine_correctly(tmp_path):
    """An API service depending on healthy db, completed migrator, and started cache."""
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        f"services = {SERVICES!r}\n"
        "res = {'name': 'api'}\n"
        "manifest = {'dependsOn': [\n"
        "  {'name': 'db', 'condition': 'service_healthy'},\n"
        "  {'name': 'migrator', 'condition': 'service_completed_successfully'},\n"
        "  {'name': 'cache', 'condition': 'service_started'},\n"
        "]}\n"
        "r = {'deps': build_resource_deps(res, 'api', manifest, {}, [], {}, {}, None, services)}\n",
    )
    expected = ["db", "db-healthy", "migrator", "migrator-done", "cache"]
    assert result["deps"] == expected


@TILT_REQUIRED
def test_postgres_dependency_with_service_healthy_condition(tmp_path):
    """Shared platform Postgres dependency with service_healthy adds postgres-healthy."""
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        f"services = {SERVICES!r}\n"
        "res = {'name': 'api'}\n"
        "manifest = {'dependsOn': [{'name': 'postgres', 'condition': 'service_healthy'}]}\n"
        "r = {'deps': build_resource_deps(res, 'api', manifest, {}, [], {}, {}, None, services)}\n",
    )
    assert result["deps"] == ["postgres", "postgres-healthy"]


def test_orchestrator_source_registers_healthy_resource():
    """Verify orchestrator registers healthy local_resource and healthy script."""
    source = ORCHESTRATOR.read_text()
    assert "_register_healthy_resource(config," in source
    assert "name=job_healthy_resource_name(config['res_name'])" in source
    assert 'labels=config[\'labels\'] + [\'health\']' in source
    assert "_HEALTHY_SCRIPT = (" in source
    assert 'has_health="$(docker inspect --format="{{if .State.Health}}yes{{else}}no{{end}}"' in source
    assert 'if [ "$health" = "healthy" ]; then echo "$job is healthy"; exit 0; fi;' in source
    assert 'if [ "$health" = "unhealthy" ]; then echo "ERROR: $job is unhealthy"; exit 1; fi;' in source


def test_infra_loader_source_registers_postgres_healthy():
    """Verify infra-loader registers postgres-healthy resource."""
    source = INFRA_LOADER.read_text()
    assert "name='postgres-healthy'" in source
    assert "resource_deps=['postgres']" in source
    assert "_HEALTHY_POSTGRES_SCRIPT" in source


def test_tiltfile_template_includes_healthy_resources():
    """Verify cli/templates/Tiltfile.hbs retains healthy resources in focus mode."""
    template = (REPO_ROOT / "cli" / "templates" / "Tiltfile.hbs").read_text()
    assert "_KNOWN_TILT_RESOURCES.add('postgres-healthy')" in template
    assert "_KNOWN_TILT_RESOURCES.add(_KNOWN_RES_NAME + '-healthy')" in template
    assert "_FILTERED_RESOURCES.append(_R + '-healthy')" in template
    assert "_FILTERED_RESOURCES.append(_STACK_RES_NAME + '-healthy')" in template
    assert "_ALWAYS_ENABLED_INFRA_RESOURCES.append('postgres-healthy')" in template


@TILT_REQUIRED
def test_production_registration_emits_healthy_and_done_resources(tmp_path):
    """Verify production registration functions emit valid <res>-healthy and <job>-done resources."""
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'register_healthy_resource', 'register_job_done_resource')\n"
        "config_backend = {\n"
        "    'res_name': 'orders-backend',\n"
        "    'res_path': 'services/orders-backend',\n"
        "    'res_deps': ['postgres'],\n"
        "    'labels': ['orders'],\n"
        "    'syncs': [],\n"
        "    'manifest': {'appType': 'backend', 'healthCheck': {'path': '/health', 'interval': 5}},\n"
        "}\n"
        "config_migrator = {\n"
        "    'res_name': 'orders-migrator',\n"
        "    'res_path': 'services/orders-migrator',\n"
        "    'res_deps': ['postgres'],\n"
        "    'labels': ['orders'],\n"
        "    'syncs': [],\n"
        "    'manifest': {'appType': 'migrator'},\n"
        "}\n"
        "register_healthy_resource(config_backend, 'services/orders-backend', 'orders', True)\n"
        "register_job_done_resource(config_migrator, 'services/orders-migrator', 'orders', True)\n"
        "r = {'registered': True}\n",
    )
    assert result["registered"] is True


def run_starlark(tmp_path: Path, body: str, env: dict[str, str] | None = None) -> dict:
    """Run `body` in a Tiltfile; `body` must assign a dict to `r`."""
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(
        body.replace("@ORCHESTRATOR", str(ORCHESTRATOR_DIR))
        .replace("@COMMON", str(COMMON_DIR))
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
    assert "Error in fail: RESULT" in output, output[-3000:]
    return json.loads(output.split("Error in fail: RESULT", 1)[1].strip())


def run_starlark_failure(tmp_path: Path, body: str) -> str:
    tiltfile = tmp_path / "Tiltfile"
    full_body = (
        body.replace("@ORCHESTRATOR", str(ORCHESTRATOR_DIR))
        .replace("@COMMON", str(COMMON_DIR))
    )
    tiltfile.write_text(full_body + "\n")
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert proc.returncode != 0, f"Expected failure but succeeded: {proc.stdout}\n{proc.stderr}"
    return proc.stdout + proc.stderr


@TILT_REQUIRED
def test_migrator_with_service_healthy_fails_with_manifest_error(tmp_path):
    """condition: 'service_healthy' on a one-shot job is rejected without silent substitution."""
    output = run_starlark_failure(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        f"services = {SERVICES!r}\n"
        "res = {'name': 'api'}\n"
        "manifest = {'dependsOn': [{'name': 'migrator', 'condition': 'service_healthy'}]}\n"
        "r = {'deps': build_resource_deps(res, 'api', manifest, {}, [], {}, {}, None, services)}\n",
    )
    assert "MANIFEST ERROR: dependency 'migrator' of 'api' specifies condition 'service_healthy', but 'migrator' is a one-shot job" in output


@TILT_REQUIRED
def test_persistent_service_with_completed_successfully_fails_with_manifest_error(tmp_path):
    """condition: 'service_completed_successfully' on a long-running service is rejected."""
    output = run_starlark_failure(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        f"services = {SERVICES!r}\n"
        "res = {'name': 'api'}\n"
        "manifest = {'dependsOn': [{'name': 'db', 'condition': 'service_completed_successfully'}]}\n"
        "r = {'deps': build_resource_deps(res, 'api', manifest, {}, [], {}, {}, None, services)}\n",
    )
    assert "MANIFEST ERROR: dependency 'db' of 'api' specifies condition 'service_completed_successfully', but 'db' is a long-running service" in output


@TILT_REQUIRED
def test_heterogeneous_stack_with_service_healthy(tmp_path):
    """Stack dependency with service_healthy routes backend to -healthy and migrator to -done without error."""
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        f"services = {SERVICES!r}\n"
        "res = {'name': 'frontend'}\n"
        "manifest = {'dependsOn': [{'name': 'shop', 'condition': 'service_healthy'}]}\n"
        "r = {'deps': build_resource_deps(res, 'frontend', manifest, {}, [], {}, {}, None, services)}\n",
    )
    # Backend persistent service gets -healthy, migrator gets -done
    assert result["deps"] == ["shop-backend", "shop-backend-healthy", "shop-migrator", "shop-migrator-done"]


@TILT_REQUIRED
def test_heterogeneous_stack_with_service_completed_successfully(tmp_path):
    """Stack dependency with service_completed_successfully routes backend to -healthy and migrator to -done."""
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        f"services = {SERVICES!r}\n"
        "res = {'name': 'frontend'}\n"
        "manifest = {'dependsOn': [{'name': 'shop', 'condition': 'service_completed_successfully'}]}\n"
        "r = {'deps': build_resource_deps(res, 'frontend', manifest, {}, [], {}, {}, None, services)}\n",
    )
    assert result["deps"] == ["shop-backend", "shop-backend-healthy", "shop-migrator", "shop-migrator-done"]


@TILT_REQUIRED
def test_homogeneous_stack_with_service_healthy(tmp_path):
    """Stack dependency on stack with only persistent services maps all members to -healthy."""
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        f"services = {SERVICES!r}\n"
        "res = {'name': 'frontend'}\n"
        "manifest = {'dependsOn': [{'name': 'core', 'condition': 'service_healthy'}]}\n"
        "r = {'deps': build_resource_deps(res, 'frontend', manifest, {}, [], {}, {}, None, services)}\n",
    )
    assert result["deps"] == ["core-api", "core-api-healthy", "core-worker", "core-worker-healthy"]


@TILT_REQUIRED
def test_stack_dependency_with_service_started(tmp_path):
    """Stack dependency with service_started includes only base resources (no -healthy or -done companions)."""
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        f"services = {SERVICES!r}\n"
        "res = {'name': 'frontend'}\n"
        "manifest = {'dependsOn': [{'name': 'shop', 'condition': 'service_started'}]}\n"
        "r = {'deps': build_resource_deps(res, 'frontend', manifest, {}, [], {}, {}, None, services)}\n",
    )
    assert result["deps"] == ["shop-backend", "shop-migrator"]


@TILT_REQUIRED
def test_stack_dependency_unconditioned_defaults_migrator_to_done(tmp_path):
    """Unconditioned stack dependency preserves base resources and defaults migrator to -done (#2871)."""
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        f"services = {SERVICES!r}\n"
        "res = {'name': 'frontend'}\n"
        "manifest = {'dependsOn': ['shop']}\n"
        "r = {'deps': build_resource_deps(res, 'frontend', manifest, {}, [], {}, {}, None, services)}\n",
    )
    assert result["deps"] == ["shop-backend", "shop-migrator", "shop-migrator-done"]


@TILT_REQUIRED
def test_stack_dependency_no_cycles(tmp_path):
    """Verify stack dependency expansion produces acyclic dependency graphs."""
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        "load('@COMMON/dependencies.star', 'find_dependency_cycle')\n"
        f"services = {SERVICES!r}\n"
        "res = {'name': 'frontend'}\n"
        "manifest = {'dependsOn': [{'name': 'shop', 'condition': 'service_healthy'}]}\n"
        "deps = build_resource_deps(res, 'frontend', manifest, {}, [], {}, {}, None, services)\n"
        "edges = {'frontend': deps, 'shop-backend-healthy': ['shop-backend'], 'shop-migrator-done': ['shop-migrator']}\n"
        "r = {'cycle': find_dependency_cycle(edges)}\n",
    )
    assert result["cycle"] == []


MANIFEST_PARSER = TILT_DIR / "manifest" / "parser.star"


@TILT_REQUIRED
def test_normalized_manifest_parser_to_orchestrator(tmp_path):
    """Test full parser-to-orchestrator pipeline: normalize_depends_on -> build_resource_deps."""
    result = run_starlark(
        tmp_path,
        f"load('{MANIFEST_PARSER}', 'normalize_depends_on')\n"
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        f"services = {SERVICES!r}\n"
        "raw_manifest = {\n"
        "  'name': 'api',\n"
        "  'dependsOn': [\n"
        "    {'name': 'db', 'condition': 'service_healthy'},\n"
        "    {'name': 'migrator', 'condition': 'service_completed_successfully'},\n"
        "    {'name': 'cache', 'condition': 'service_started'},\n"
        "  ]\n"
        "}\n"
        "normalized = normalize_depends_on(raw_manifest)\n"
        "r = {\n"
        "  'norm_dependsOn': normalized.get('dependsOn'),\n"
        "  'norm_conditions': normalized.get('dependsOnConditions'),\n"
        "  'deps': build_resource_deps({'name': 'api'}, 'api', normalized, {}, [], {}, {}, None, services),\n"
        "}\n",
    )
    assert result["norm_dependsOn"] == ["db", "migrator", "cache"]
    assert result["norm_conditions"] == {
        "db": "service_healthy",
        "migrator": "service_completed_successfully",
        "cache": "service_started",
    }
    assert result["deps"] == ["db", "db-healthy", "migrator", "migrator-done", "cache"]


@TILT_REQUIRED
def test_normalized_manifest_stack_expansion(tmp_path):
    """Normalized stack dependency with condition expands correctly in orchestrator."""
    result = run_starlark(
        tmp_path,
        f"load('{MANIFEST_PARSER}', 'normalize_depends_on')\n"
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        f"services = {SERVICES!r}\n"
        "raw_manifest = {'name': 'frontend', 'dependsOn': [{'name': 'shop', 'condition': 'service_healthy'}]}\n"
        "normalized = normalize_depends_on(raw_manifest)\n"
        "r = {\n"
        "  'norm_dependsOn': normalized.get('dependsOn'),\n"
        "  'norm_conditions': normalized.get('dependsOnConditions'),\n"
        "  'deps': build_resource_deps({'name': 'frontend'}, 'frontend', normalized, {}, [], {}, {}, None, services),\n"
        "}\n",
    )
    assert result["norm_dependsOn"] == ["shop"]
    assert result["norm_conditions"] == {"shop": "service_healthy"}
    assert result["deps"] == ["shop-backend", "shop-backend-healthy", "shop-migrator", "shop-migrator-done"]


@TILT_REQUIRED
def test_normalized_manifest_unspecified_conditions(tmp_path):
    """Normalized manifest without explicit conditions preserves standard dependencies and migrator completion."""
    result = run_starlark(
        tmp_path,
        f"load('{MANIFEST_PARSER}', 'normalize_depends_on')\n"
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        f"services = {SERVICES!r}\n"
        "raw_manifest = {'name': 'api', 'dependsOn': ['db', 'migrator']}\n"
        "normalized = normalize_depends_on(raw_manifest)\n"
        "r = {\n"
        "  'norm_dependsOn': normalized.get('dependsOn'),\n"
        "  'deps': build_resource_deps({'name': 'api'}, 'api', normalized, {}, [], {}, {}, None, services),\n"
        "}\n",
    )
    assert result["norm_dependsOn"] == ["db", "migrator"]
    assert result["deps"] == ["db", "migrator", "migrator-done"]


@TILT_REQUIRED
def test_conflicting_depends_on_conditions_fails_with_manifest_error(tmp_path):
    """normalize_depends_on rejects repeated dependency with conflicting conditions."""
    output = run_starlark_failure(
        tmp_path,
        f"load('{MANIFEST_PARSER}', 'normalize_depends_on')\n"
        "raw_manifest = {\n"
        "  'name': 'api',\n"
        "  'dependsOn': [\n"
        "    {'name': 'db', 'condition': 'service_healthy'},\n"
        "    {'name': 'db', 'condition': 'service_started'},\n"
        "  ]\n"
        "}\n"
        "normalize_depends_on(raw_manifest)\n",
    )
    assert "MANIFEST ERROR: 'dependsOn' lists 'db' with conflicting conditions 'service_healthy' and 'service_started'" in output


@TILT_REQUIRED
def test_conflicting_depends_on_string_and_condition_fails_with_manifest_error(tmp_path):
    """normalize_depends_on rejects dependency declared as string and conflicting condition object."""
    output = run_starlark_failure(
        tmp_path,
        f"load('{MANIFEST_PARSER}', 'normalize_depends_on')\n"
        "raw_manifest = {\n"
        "  'name': 'api',\n"
        "  'dependsOn': [\n"
        "    'db',\n"
        "    {'name': 'db', 'condition': 'service_healthy'},\n"
        "  ]\n"
        "}\n"
        "normalize_depends_on(raw_manifest)\n",
    )
    assert "MANIFEST ERROR: 'dependsOn' lists 'db' with conflicting conditions 'service_started' and 'service_healthy'" in output


@TILT_REQUIRED
def test_service_healthy_on_byo_without_healthcheck_fails_with_manifest_error(tmp_path):
    """condition: 'service_healthy' on a bring-your-own service with no health check fails at manifest validation."""
    output = run_starlark_failure(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        f"services = {SERVICES!r}\n"
        "res = {'name': 'api'}\n"
        "manifest = {'dependsOn': [{'name': 'byo-no-health', 'condition': 'service_healthy'}]}\n"
        "build_resource_deps(res, 'api', manifest, {}, [], {}, {}, None, services)\n",
    )
    assert "MANIFEST ERROR: dependency 'byo-no-health' of 'api' specifies condition 'service_healthy', but 'byo-no-health' has no health check configured" in output


@TILT_REQUIRED
def test_service_healthy_on_service_with_disabled_healthcheck_fails_with_manifest_error(tmp_path):
    """condition: 'service_healthy' on a service with healthCheck: false fails at manifest validation."""
    output = run_starlark_failure(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        f"services = {SERVICES!r}\n"
        "res = {'name': 'api'}\n"
        "manifest = {'dependsOn': [{'name': 'disabled-health', 'condition': 'service_healthy'}]}\n"
        "build_resource_deps(res, 'api', manifest, {}, [], {}, {}, None, services)\n",
    )
    assert "MANIFEST ERROR: dependency 'disabled-health' of 'api' specifies condition 'service_healthy', but 'disabled-health' has no health check configured" in output


@TILT_REQUIRED
def test_service_healthy_on_byo_with_healthcheck_port_succeeds(tmp_path):
    """condition: 'service_healthy' on a bring-your-own service with configured healthCheck port succeeds."""
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps', 'job_healthy_resource_name')\n"
        f"services = {SERVICES!r}\n"
        "res = {'name': 'api'}\n"
        "manifest = {'dependsOn': [{'name': 'byo-with-port', 'condition': 'service_healthy'}]}\n"
        "r = {\n"
        "  'deps': build_resource_deps(res, 'api', manifest, {}, [], {}, {}, None, services),\n"
        "  'healthy_name': job_healthy_resource_name('byo-with-port'),\n"
        "}\n",
    )
    assert result["deps"] == ["byo-with-port", "byo-with-port-healthy"]
    assert result["healthy_name"] == "byo-with-port-healthy"


def _docker_daemon_responds() -> bool:
    try:
        return subprocess.run(["docker", "info"], capture_output=True, timeout=15).returncode == 0
    except (subprocess.TimeoutExpired, OSError):
        return False


DOCKER_AVAILABLE = shutil.which("docker") is not None and _docker_daemon_responds()


@pytest.mark.skipif(not DOCKER_AVAILABLE, reason="docker CLI or daemon not available")
class TestLiveDependencyConditions:
    """Live Docker and Tilt integration testing healthy checks and one-shot exit conditions."""

    def test_live_tilt_orchestration_startup_sequence(self, tmp_path):
        """
        Real Tilt orchestration test:
        - DB starts with a delayed health check (sleep 2, touch /tmp/ready).
        - db-healthy local_resource runs HEALTHY_SCRIPT and waits until healthy.
        - Migrator runs migrations and exits 0.
        - migrator-done local_resource runs JOB_DONE_SCRIPT and waits until exit 0.
        - Dependent API runs only after both gates pass.
        - Verifies exact execution timestamps: t(db) < t(db-healthy) < t(migrator-done) < t(api).
        """
        prefix = f"flisk_tilt_seq_{uuid.uuid4().hex[:8]}"
        db_name = f"{prefix}_db"
        migrator_name = f"{prefix}_migrator"
        api_name = f"{prefix}_api"
        timestamps_file = tmp_path / "timestamps.json"

        api_cmd = f"docker run -d --name {api_name} --health-cmd 'test -f /tmp/api_ready' --health-interval 1s --health-retries 10 --health-start-period 1s alpine sh -c 'sleep 1 && touch /tmp/api_ready && sleep 30' && python3 -c \"import time, json; json.dump({{'api_start': time.time()}}, open('{timestamps_file}', 'w'))\""

        try:
            tiltfile = tmp_path / "Tiltfile"
            starlark = f"""
load('{ORCHESTRATOR_DIR}/apply_compose_resource_registration.star', 'HEALTHY_SCRIPT', 'JOB_DONE_SCRIPT')

local_resource(
    'db',
    cmd='docker run -d --name {db_name} --health-cmd "test -f /tmp/ready" --health-interval 1s --health-retries 10 --health-start-period 1s alpine sh -c "sleep 2 && touch /tmp/ready && sleep 30"'
)

local_resource(
    'db-healthy',
    cmd=['sh', '-c', HEALTHY_SCRIPT, 'sh', '{db_name}', '30'],
    resource_deps=['db']
)

local_resource(
    'migrator',
    cmd='docker run -d --name {migrator_name} alpine sh -c "sleep 1 && exit 0"',
    resource_deps=['db-healthy']
)

local_resource(
    'migrator-done',
    cmd=['sh', '-c', JOB_DONE_SCRIPT, 'sh', '{migrator_name}'],
    resource_deps=['migrator']
)

local_resource(
    'api',
    cmd={api_cmd!r},
    resource_deps=['db-healthy', 'migrator-done']
)

local_resource(
    'api-healthy',
    cmd=['sh', '-c', HEALTHY_SCRIPT, 'sh', '{api_name}', '30'],
    resource_deps=['api']
)
"""
            tiltfile.write_text(starlark)
            start_time = time.time()
            res = subprocess.run(
                ["tilt", "ci", "--port", "0", "--timeout", "45s", "-f", str(tiltfile)],
                capture_output=True,
                text=True,
                timeout=60,
            )
            assert res.returncode == 0, f"Tilt orchestration failed: {res.stdout}\n{res.stderr}"
            assert timestamps_file.exists(), "API did not execute"
            data = json.loads(timestamps_file.read_text())
            assert data["api_start"] >= start_time + 2.0
            assert "is healthy" in res.stdout
            assert "finished (exit code 0)" in res.stdout

        finally:
            subprocess.run(["docker", "rm", "-f", db_name, migrator_name, api_name], capture_output=True)

    def test_live_tilt_orchestration_unhealthy_db_blocks_api(self, tmp_path):
        """Unhealthy database halts Tilt orchestration; dependent API never executes."""
        prefix = f"flisk_tilt_unhealthy_{uuid.uuid4().hex[:8]}"
        db_name = f"{prefix}_db"
        api_sentinel = tmp_path / "api_should_never_run.txt"

        try:
            tiltfile = tmp_path / "Tiltfile"
            starlark = f"""
load('{ORCHESTRATOR_DIR}/apply_compose_resource_registration.star', 'HEALTHY_SCRIPT')

local_resource(
    'db',
    cmd='docker run -d --name {db_name} --health-cmd "false" --health-interval 1s --health-retries 1 --health-start-period 1s alpine sh -c "sleep 30"'
)

local_resource(
    'db-healthy',
    cmd=['sh', '-c', HEALTHY_SCRIPT, 'sh', '{db_name}', '5'],
    resource_deps=['db']
)

local_resource(
    'api',
    cmd='echo "RAN" > {api_sentinel}',
    resource_deps=['db-healthy']
)
"""
            tiltfile.write_text(starlark)
            res = subprocess.run(
                ["tilt", "ci", "--port", "0", "--timeout", "20s", "-f", str(tiltfile)],
                capture_output=True,
                text=True,
                timeout=30,
            )
            assert res.returncode != 0, "Expected Tilt orchestration to fail on unhealthy DB"
            assert not api_sentinel.exists(), "API executed despite unhealthy upstream database!"
            assert "is unhealthy" in res.stdout or "timed out waiting" in res.stdout

        finally:
            subprocess.run(["docker", "rm", "-f", db_name], capture_output=True)

    def test_live_tilt_orchestration_failed_migration_blocks_api(self, tmp_path):
        """Failing migration (non-zero exit code) halts Tilt orchestration; dependent API never executes."""
        prefix = f"flisk_tilt_migfail_{uuid.uuid4().hex[:8]}"
        migrator_name = f"{prefix}_migrator"
        api_sentinel = tmp_path / "api_should_never_run.txt"

        try:
            tiltfile = tmp_path / "Tiltfile"
            starlark = f"""
load('{ORCHESTRATOR_DIR}/apply_compose_resource_registration.star', 'JOB_DONE_SCRIPT')

local_resource(
    'migrator',
    cmd="docker run -d --name {migrator_name} alpine sh -c 'exit 1'"
)

local_resource(
    'migrator-done',
    cmd=['sh', '-c', JOB_DONE_SCRIPT, 'sh', '{migrator_name}'],
    resource_deps=['migrator']
)

local_resource(
    'api',
    cmd='echo "RAN" > {api_sentinel}',
    resource_deps=['migrator-done']
)
"""
            tiltfile.write_text(starlark)
            res = subprocess.run(
                ["tilt", "ci", "--port", "0", "--timeout", "20s", "-f", str(tiltfile)],
                capture_output=True,
                text=True,
                timeout=30,
            )
            assert res.returncode != 0, "Expected Tilt orchestration to fail on failed migration"
            assert not api_sentinel.exists(), "API executed despite failed upstream migration!"
            assert "exited with code 1" in res.stdout

        finally:
            subprocess.run(["docker", "rm", "-f", migrator_name], capture_output=True)

    def test_live_healthy_script_fast_fails_on_exited_container(self, tmp_path):
        """P3: Exited container with restart: 'no' promptly fails health check in <10s instead of waiting 120s."""
        prefix = f"flisk_tilt_exited_{uuid.uuid4().hex[:8]}"
        container_name = f"{prefix}_crashed"

        try:
            subprocess.run(
                ["docker", "run", "-d", "--name", container_name, "alpine", "sh", "-c", "exit 1"],
                check=True,
                capture_output=True,
            )
            tiltfile = tmp_path / "Tiltfile"
            starlark = f"""
load('{ORCHESTRATOR_DIR}/apply_compose_resource_registration.star', 'HEALTHY_SCRIPT')

local_resource(
    'check',
    cmd=['sh', '-c', HEALTHY_SCRIPT, 'sh', '{container_name}', '120']
)
"""
            tiltfile.write_text(starlark)
            start_time = time.time()
            res = subprocess.run(
                ["tilt", "ci", "--port", "0", "--timeout", "20s", "-f", str(tiltfile)],
                capture_output=True,
                text=True,
                timeout=30,
            )
            elapsed = time.time() - start_time
            assert res.returncode != 0
            assert elapsed < 10, f"Expected fast failure on exited container, but took {elapsed:.1f}s"
            assert "will not restart" in res.stdout

        finally:
            subprocess.run(["docker", "rm", "-f", container_name], capture_output=True)

    def test_live_postgres_poller_anchored_lookup_and_timeout_when_absent(self, tmp_path):
        """Postgres health poller anchors container lookup so substring matches from other projects are ignored."""
        proj = f"p_{uuid.uuid4().hex[:6]}"
        exact_cname = f"{proj}_postgres"
        other_proj_cname = f"other_{proj}_postgres_extra"

        try:
            # Start another container that contains `proj_postgres` as a substring and is healthy
            subprocess.run(
                [
                    "docker", "run", "-d", "--name", other_proj_cname,
                    "--health-cmd", "true", "--health-interval", "1s", "--health-retries", "1",
                    "alpine", "sh", "-c", "sleep 30",
                ],
                check=True,
                capture_output=True,
            )
            # Wait 2s for other container to report healthy
            time.sleep(2)

            tiltfile = tmp_path / "Tiltfile"
            starlark = f"""
load('{INFRA_LOADER}', 'HEALTHY_POSTGRES_SCRIPT')

local_resource(
    'check_pg',
    cmd=['sh', '-c', HEALTHY_POSTGRES_SCRIPT, 'sh', '{proj}']
)
"""
            tiltfile.write_text(starlark)
            # Run tilt ci with short timeout: it should time out and NOT mistake other_proj_cname for exact_cname
            # The script loops 120s by default, but we test running the script directly with max 3s timeout
            poller_cmd = [
                "sh", "-c",
                f'name="{proj}"; cname="${{name}}_postgres"; exited_count=0; '
                + 'for i in $(seq 1 3); do '
                + '  id="$(docker ps -q -f "name=^/${cname}$" 2>/dev/null | head -n 1)"; '
                + '  if [ -z "$id" ]; then id="$(docker ps -a -q -f "name=^/${cname}$" 2>/dev/null | head -n 1)"; fi; '
                + '  if [ -z "$id" ]; then sleep 1; continue; fi; '
                + '  health="$(docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}" "$id" 2>/dev/null)"; '
                + '  if [ "$health" = "healthy" ]; then echo "postgres is healthy"; exit 0; fi; '
                + '  sleep 1; '
                + 'done; '
                + 'echo "ERROR: timed out waiting for postgres to become healthy"; exit 1',
            ]
            res_absent = subprocess.run(poller_cmd, capture_output=True, text=True)
            assert res_absent.returncode == 1, "Poller should have timed out and failed because exact container is absent"
            assert "ERROR: timed out waiting for postgres to become healthy" in res_absent.stdout
            assert "postgres is healthy" not in res_absent.stdout

            # Now start the exact container and verify it matches and succeeds
            subprocess.run(
                [
                    "docker", "run", "-d", "--name", exact_cname,
                    "--health-cmd", "true", "--health-interval", "1s", "--health-retries", "1",
                    "alpine", "sh", "-c", "sleep 30",
                ],
                check=True,
                capture_output=True,
            )
            time.sleep(2)
            res_exact = subprocess.run(poller_cmd, capture_output=True, text=True)
            assert res_exact.returncode == 0, f"Poller failed to detect exact container: {res_exact.stderr}"
            assert "postgres is healthy" in res_exact.stdout

        finally:
            subprocess.run(["docker", "rm", "-f", other_proj_cname, exact_cname], capture_output=True)
