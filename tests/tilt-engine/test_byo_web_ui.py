# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
`webUi: true` on a bring-your-own resource (#2997): an app that serves pages from `/` is routed on its own host name,
`<name>.<project>.localhost`, with no path prefix. Without it a routed bring-your-own resource keeps the /api/<name> route.

Runs the real generator through Tilt's interpreter (`tilt alpha tiltfile-result`).
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

BODY = """
load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry')
load('@ENGINE/topologies/tilt/resources/orchestrator/apply_compose_resource_registration.star', 'count_routable_backends_by_stack')

ui = {'appType': 'bring-your-own', 'stack': 'trek', 'port': 3000, 'image': 'mauriceboe/trek', 'healthCheckPath': '/api/health', 'webUi': True}
api = {'appType': 'bring-your-own', 'stack': 'trek', 'port': 4000, 'image': 'example/api', 'healthCheckPath': '/health'}
private_ui = {'appType': 'bring-your-own', 'stack': 'trek', 'port': 3000, 'image': 'example/ui', 'webUi': True, 'exposeViaProxy': False}
explicit = {'appType': 'bring-your-own', 'stack': 'trek', 'port': 3000, 'image': 'example/ui', 'webUi': True, 'traefik': {'host': 'trek.example.test'}}
bad = {'appType': 'bring-your-own', 'stack': 'trek', 'port': 3000, 'image': 'example/ui', 'webUi': 'yes'}

def entry(name, manifest):
    return generate_backend_compose_entry('services/trek', 'trek', {'name': name}, manifest)

manifests = {'app': ui, 'api': api, 'ui2': explicit}
r = {
    'ui': entry('app', ui),
    'api': entry('api', api),
    'private_ui': entry('private', private_ui),
    'explicit': entry('ui2', explicit),
    'counts': count_routable_backends_by_stack({'resources': [{'name': 'app'}, {'name': 'api'}, {'name': 'ui2'}]}, manifests, 'trek'),
}
"""


def run_tilt(project_root: Path, body: str) -> str:
    (project_root / ".flisk").mkdir(parents=True, exist_ok=True)
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "trek"}}))
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
    return proc.stdout + proc.stderr


@pytest.fixture(scope="module")
def result(tmp_path_factory) -> dict:
    if shutil.which("tilt") is None:
        pytest.skip("tilt CLI not installed")
    output = run_tilt(tmp_path_factory.mktemp("webui") / "trek", BODY)
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@TILT_REQUIRED
def test_web_ui_is_routed_on_its_own_host_without_a_path_prefix(result):
    labels = result["ui"]

    assert "traefik.http.routers.trek-app.rule=Host(`app.trek.localhost`)" in labels
    assert "stripprefix" not in labels
    assert "PathPrefix" not in labels
    assert "/api/app" not in labels
    assert "traefik.http.services.trek-app.loadbalancer.server.port=3000" in labels
    assert "traefik.http.services.trek-app.loadbalancer.healthcheck.path=/api/health" in labels


@TILT_REQUIRED
def test_api_keeps_the_path_prefix_route(result):
    labels = result["api"]

    assert "Host(`api.trek.localhost`) && PathPrefix(`/api/api`)" in labels
    assert "stripprefix.prefixes=/api/api" in labels


@TILT_REQUIRED
def test_private_web_ui_has_no_route(result):
    assert "traefik.enable=false" in result["private_ui"]
    assert "Host(`" not in result["private_ui"]


@TILT_REQUIRED
def test_explicit_traefik_host_is_an_extra_name_for_the_web_ui(result):
    assert "rule=Host(`ui2.trek.localhost`) || Host(`trek.example.test`)" in result["explicit"]


@TILT_REQUIRED
def test_web_ui_does_not_count_toward_the_shared_stack_routers(result):
    # Only the API is a stack-scoped backend; the web UIs have routers of their own.
    assert result["counts"] == {"trek": 1}


@TILT_REQUIRED
def test_web_ui_must_be_a_boolean(tmp_path):
    body = BODY.replace("r = {", "ignored = entry('x', bad)\nr = {", 1)
    output = run_tilt(tmp_path / "trek", body)

    assert "'webUi' must be true or false" in output
