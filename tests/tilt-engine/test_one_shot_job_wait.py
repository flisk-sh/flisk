# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
A service that depends on a one-shot job (a migrator, or a bring-your-own resource with "restart": "no") starts only
after the job exited 0 (#2871).

Tilt counts a Compose resource as ready once its container runs, so the orchestrator registers a `<job>-done` resource
that runs `docker wait` on the job's container and fails unless it exited 0, and every dependent waits for it too.
Executes the real Starlark through Tilt's interpreter (`tilt alpha tiltfile-result`).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from test_dependson_platform_postgres import ORCHESTRATOR, TILT_REQUIRED, run_starlark

pytestmark = [pytest.mark.generator]

REPO_ROOT = Path(__file__).resolve().parents[2]
ONE_SHOT_MODULE = REPO_ROOT / "runtime/engine/topologies/platform/docker/compose/one_shot_job.star"

SERVICES = {
    "app": {
        "name": "app",
        "stack": "app",
        "resources": [
            {"name": "migrations", "_manifest": {"appType": "migrator"}},
            {"name": "seed", "_manifest": {"appType": "bring-your-own", "restart": "no"}},
            {"name": "cache", "_manifest": {"appType": "bring-your-own"}},
            {"name": "jobs", "_manifest": {"appType": "worker"}},
            {"name": "api", "_manifest": {"appType": "backend"}},
        ],
    },
}
for _res in SERVICES["app"]["resources"]:
    SERVICES[_res["name"]] = SERVICES["app"]


@TILT_REQUIRED
def test_a_dependent_waits_for_the_job_done_resource(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps', 'job_done_resource_name')\n"
        f"services = {SERVICES!r}\n"
        "res = {'name': 'api'}\n"
        "r = {"
        "'jobs': build_resource_deps(res, 'api', {'dependsOn': ['migrations', 'seed']}, {}, [], {}, {}, None, services), "
        "'others': build_resource_deps(res, 'api', {'dependsOn': ['cache', 'jobs']}, {}, [], {}, {}, None, services), "
        "'stack': build_resource_deps(res, 'api', {'dependsOn': ['app']}, {}, [], {}, {}, None, services), "
        "'name': job_done_resource_name('migrations'), "
        "}\n",
    )
    assert result["jobs"] == ["migrations", "migrations-done", "seed", "seed-done"]
    # A long-running bring-your-own server and a worker have no -done resource to wait for.
    assert result["others"] == ["cache", "jobs"]
    # A stack dependency waits for the stack's jobs to finish as well.
    assert "migrations-done" in result["stack"] and "seed-done" in result["stack"]
    assert result["name"] == "migrations-done"


@TILT_REQUIRED
def test_one_shot_job_detection(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('" + str(ONE_SHOT_MODULE) + "', 'is_one_shot_job')\n"
        "r = {"
        "'migrator': is_one_shot_job({'appType': 'migrator'}), "
        "'byo_no': is_one_shot_job({'appType': 'bring-your-own', 'restart': 'no'}), "
        "'byo': is_one_shot_job({'appType': 'bring-your-own'}), "
        "'backend_no': is_one_shot_job({'appType': 'backend', 'restart': 'no'}), "
        "'none': is_one_shot_job(None), "
        "}\n",
    )
    assert result == {"migrator": True, "byo_no": True, "byo": False, "backend_no": False, "none": False}


def test_source_registers_a_done_resource_that_waits_with_docker_wait():
    source = ORCHESTRATOR.read_text()
    assert "if is_one_shot_job(config.get('manifest', {})):\n        _register_job_done_resource(" in source
    # docker wait on the container id also works for a job that already exited (docker compose wait finds no container then).
    assert "argv = ['sh', '-c', _JOB_DONE_SCRIPT, 'sh', config['res_name']]" in source
    assert 'code="$(docker wait "$id")"' in source
    assert "resource_deps=[config['res_name']]," in source
    # Copies the output file to the host state directory on success, or purges stale output on failure (#2864).
    assert 'docker cp "$id":/tmp/flisk-output.env ".flisk/outputs/$job.env"' in source
    assert 'rm -f ".flisk/outputs/$job.env"' in source
    template = (REPO_ROOT / "cli/templates/Tiltfile.hbs").read_text()
    # Focus mode must enable the -done resources, or `flisk up <stack>` disables them and dependents wait forever.
    assert "_KNOWN_TILT_RESOURCES.add(_KNOWN_RES_NAME + '-done')" in template
    assert "_FILTERED_RESOURCES.append(_R + '-done')" in template
    assert "_FILTERED_RESOURCES.append(_STACK_RES_NAME + '-done')" in template
