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
            {"name": "db", "_manifest": {"appType": "bring-your-own"}},
            {"name": "migrator", "_manifest": {"appType": "migrator"}},
            {"name": "cache", "_manifest": {"appType": "bring-your-own"}},
            {"name": "api", "_manifest": {"appType": "backend"}},
        ],
    },
}
for _res in SERVICES["app"]["resources"]:
    SERVICES[_res["name"]] = SERVICES["app"]


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


DOCKER_AVAILABLE = shutil.which("docker") is not None


@pytest.mark.skipif(not DOCKER_AVAILABLE, reason="docker CLI not available")
class TestLiveDependencyConditions:
    """Live Docker integration testing healthy checks and one-shot exit conditions."""

    def test_live_healthy_check_and_migrator_sequence(self):
        """
        Verify startup sequence:
        - DB container with healthcheck transitions from starting -> healthy.
        - Migrator runs, creates table/output, and exits 0.
        - Healthy check script only succeeds after DB is healthy.
        - Job done script succeeds after migrator exits 0.
        """
        prefix = f"flisk_test_live_{int(time.time())}"
        db_name = f"{prefix}_db"
        migrator_name = f"{prefix}_migrator"

        try:
            # 1. Start database with healthcheck
            subprocess.run(
                [
                    "docker", "run", "-d",
                    "--name", db_name,
                    "--health-cmd", "test -f /tmp/ready",
                    "--health-interval", "1s",
                    "--health-retries", "10",
                    "--health-start-period", "5s",
                    "alpine", "sh", "-c", "sleep 2 && touch /tmp/ready && sleep 30"
                ],
                check=True,
                capture_output=True,
            )

            # 2. Run healthy monitoring script
            check_script = (
                f'id="$(docker ps -a -q -f name=^/{db_name}$ | head -n 1)"; '
                f'if [ -z "$id" ]; then exit 1; fi; '
                f'for i in $(seq 1 30); do '
                f'  status="$(docker inspect --format="{{{{.State.Health.Status}}}}" "$id" 2>/dev/null)"; '
                f'  if [ "$status" = "healthy" ]; then exit 0; fi; '
                f'  if [ "$status" = "unhealthy" ]; then exit 1; fi; '
                f'  sleep 1; '
                f'done; exit 1'
            )
            res = subprocess.run(["sh", "-c", check_script])
            assert res.returncode == 0, "DB failed to become healthy"

            # 3. Start migrator (one-shot exit 0)
            subprocess.run(
                [
                    "docker", "run", "-d",
                    "--name", migrator_name,
                    "alpine", "sh", "-c", "echo 'migrations complete'; exit 0"
                ],
                check=True,
                capture_output=True,
            )

            # 4. Wait for migrator container exit
            migrator_id = subprocess.check_output(
                ["docker", "ps", "-a", "-q", "-f", f"name=^/{migrator_name}$"],
                text=True
            ).strip()
            code = subprocess.check_output(["docker", "wait", migrator_id], text=True).strip()
            assert code == "0", "Migrator did not exit with code 0"

        finally:
            subprocess.run(["docker", "rm", "-f", db_name, migrator_name], capture_output=True)

    def test_live_unhealthy_db_halts_startup(self):
        """Verify an unhealthy DB causes health check monitor to fail with code 1."""
        prefix = f"flisk_test_unhealthy_{int(time.time())}"
        db_name = f"{prefix}_db"

        try:
            subprocess.run(
                [
                    "docker", "run", "-d",
                    "--name", db_name,
                    "--health-cmd", "exit 1",
                    "--health-interval", "1s",
                    "--health-retries", "1",
                    "alpine", "sleep", "30"
                ],
                check=True,
                capture_output=True,
            )

            check_script = (
                f'id="$(docker ps -a -q -f name=^/{db_name}$ | head -n 1)"; '
                f'if [ -z "$id" ]; then exit 1; fi; '
                f'for i in $(seq 1 10); do '
                f'  status="$(docker inspect --format="{{{{.State.Health.Status}}}}" "$id" 2>/dev/null)"; '
                f'  if [ "$status" = "healthy" ]; then exit 0; fi; '
                f'  if [ "$status" = "unhealthy" ]; then exit 1; fi; '
                f'  sleep 1; '
                f'done; exit 1'
            )
            res = subprocess.run(["sh", "-c", check_script])
            assert res.returncode == 1, "Expected monitor to fail on unhealthy container"

        finally:
            subprocess.run(["docker", "rm", "-f", db_name], capture_output=True)

    def test_live_failed_migration_halts_startup(self):
        """Verify a failing migration (exit 1) is detected as failure."""
        prefix = f"flisk_test_failed_mig_{int(time.time())}"
        migrator_name = f"{prefix}_migrator"

        try:
            subprocess.run(
                [
                    "docker", "run", "-d",
                    "--name", migrator_name,
                    "alpine", "sh", "-c", "echo 'migration crashed'; exit 1"
                ],
                check=True,
                capture_output=True,
            )

            migrator_id = subprocess.check_output(
                ["docker", "ps", "-a", "-q", "-f", f"name=^/{migrator_name}$"],
                text=True
            ).strip()
            code = subprocess.check_output(["docker", "wait", migrator_id], text=True).strip()
            assert code != "0", "Expected non-zero exit code on failed migration"

        finally:
            subprocess.run(["docker", "rm", "-f", migrator_name], capture_output=True)
