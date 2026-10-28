# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
A resource with `"appType": "migrator"` is a one-shot job in the stack's Compose file.

It used to get the backend service: `restart: unless-stopped`, PORT, an HTTP health check and a Traefik route. The
migrator ran its migrations, exited 0, and Docker restarted it forever with its health check failing, so `flisk up`
never became ready for a project with a migrator.

Runs the real Compose generators through Tilt's interpreter (`tilt alpha tiltfile-result`), like
test_agent_resource.py. The asserts are on what Compose receives, not on the Starlark text.
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
ENGINE_ROOT = REPO_ROOT / "runtime" / "engine"
RESULT_MARKER = "Error in fail: RESULT"

# The flisk-stack layout: a backend api, and a migrator in the same stack that the api depends on.
COMPOSE_BODY = """
load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry', 'generate_app_compose_from_entries')
load('@ENGINE/topologies/tilt/resources/orchestrator/apply_compose_resource_registration.star', 'count_routable_backends_by_stack')

stack = 'app'
migrator_manifest = {'appType': 'migrator', 'stack': stack, 'featuresEnabled': ['prisma'], 'dependsOn': ['postgres']}
api_manifest = {'appType': 'backend', 'stack': stack, 'port': 4000, 'healthCheckPath': '/health', 'dependsOn': ['migrations']}

migrator_entry = generate_backend_compose_entry('services/app', stack, {'name': 'migrations'}, migrator_manifest)
api_entry = generate_backend_compose_entry('services/app', stack, {'name': 'api'}, api_manifest)
r = {
    'migrator': migrator_entry,
    'api': api_entry,
    'yaml': generate_app_compose_from_entries('services/app', [api_entry, migrator_entry]),
    'routable': count_routable_backends_by_stack(
        {'resources': [{'name': 'api'}, {'name': 'migrations'}]},
        {'api': api_manifest, 'migrations': migrator_manifest},
        stack,
    ),
}
"""


def run_tilt(tmp_path: Path, body: str) -> dict:
    project_root = tmp_path / "migrator-project"
    (project_root / ".flisk").mkdir(parents=True, exist_ok=True)
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "migrator-project"}}))
    tiltfile = project_root / "Tiltfile"
    tiltfile.write_text(body.replace("@ENGINE", str(ENGINE_ROOT)) + "\nfail('RESULT' + encode_json(r))\n")
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=180,
        cwd=project_root,
        env={**os.environ, "FLISK_PROJECT_ROOT": str(project_root)},
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@pytest.fixture(scope="module")
def result(tmp_path_factory) -> dict:
    if shutil.which("tilt") is None:
        pytest.skip("tilt CLI not installed")
    return run_tilt(tmp_path_factory.mktemp("migrator"), COMPOSE_BODY)


@TILT_REQUIRED
def test_a_migrator_is_not_restarted_after_it_exits(result):
    entry = result["migrator"]

    assert '    restart: "no"\n' in entry
    assert "unless-stopped" not in entry


@TILT_REQUIRED
def test_a_migrator_has_no_http_health_check_port_or_route(result):
    entry = result["migrator"]

    # The image's own HEALTHCHECK is switched off too, not just left out.
    assert "    healthcheck:\n      disable: true\n" in entry
    assert "curl" not in entry
    assert "PORT=" not in entry
    assert "FLISK_HEALTH_PATH" not in entry
    assert '      - "traefik.enable=false"' in entry
    assert "traefik.http." not in entry
    assert "/api/migrations" not in entry


@TILT_REQUIRED
def test_a_migrator_says_it_is_a_migrator_and_gets_the_stack_database(result):
    entry = result["migrator"]

    assert "      - FLISK_RESOURCE_TYPE=migrator\n" in entry
    assert "FLISK_RESOURCE_TYPE=backend" not in entry
    assert "/migrator_project_app?schema=public\n" in entry
    assert "      - DATABASE_URL=postgresql://migrator_project:" in entry


@TILT_REQUIRED
def test_the_backend_next_to_a_migrator_is_unchanged(result):
    entry = result["api"]

    assert "    restart: unless-stopped\n" in entry
    assert "      - PORT=4000\n" in entry
    assert "      - FLISK_HEALTH_PATH=/health\n" in entry
    assert "      - FLISK_RESOURCE_TYPE=backend\n" in entry
    assert 'test: ["CMD", "curl", "-f", "--max-time", "5", "http://localhost:4000/health"]' in entry
    assert '      - "traefik.enable=true"' in entry


@TILT_REQUIRED
def test_the_stack_compose_file_keeps_the_backend_port_anchor(result):
    yaml_text = result["yaml"]

    assert "x-backend-port: &backend-port 4000" in yaml_text
    assert "\n  migrations:\n" in yaml_text
    assert "\n  api:\n" in yaml_text


@TILT_REQUIRED
def test_a_migrator_does_not_count_as_a_routable_backend_of_its_stack(result):
    # With the migrator counted, the api looked like one of two backends sharing the stack and lost its stack routes.
    assert result["routable"] == {"app": 1}
