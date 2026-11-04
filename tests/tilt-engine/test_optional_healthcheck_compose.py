# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
`healthCheck` in service.json reaches the generated Compose file (#2235).

`"healthCheck": false` (or `{ "enabled": false }`) turns off the container probe and Traefik's; `path` replaces
healthCheckPath; `interval`, `timeout` (seconds) and `retries` replace the default timing. A backend without
`healthCheck` keeps the default /health probe.

Runs the real Compose generator through Tilt's interpreter (`tilt alpha tiltfile-result`), like
test_migrator_compose.py. The asserts are on what Compose receives, not on the Starlark text.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = [pytest.mark.generator]

REPO_ROOT = Path(__file__).resolve().parents[2]
ENGINE_ROOT = REPO_ROOT / "runtime" / "engine"
RESULT_MARKER = "Error in fail: RESULT"

COMPOSE_BODY = """
load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry')
load('@ENGINE/topologies/platform/docker/layers/l4_runtime_layers.star', 'L4_generate_backend_runtime')

def backend(name, **extra):
    manifest = {'appType': 'backend', 'stack': 'app', 'port': 4000, 'healthCheckPath': '/health'}
    manifest.update(extra)
    return generate_backend_compose_entry('services/app', 'app', {'name': name}, manifest), manifest

entries = {}
l4 = {}
for name, extra in [
    ('plain', {}),
    ('off', {'healthCheck': False}),
    ('off-obj', {'healthCheck': {'enabled': False}}),
    ('custom', {'healthCheck': {'path': '/livez', 'interval': 7, 'timeout': 3, 'retries': 5}}),
    ('timed', {'healthCheck': {'interval': 9}}),
]:
    entry, manifest = backend(name, **extra)
    entries[name] = entry
    l4[name] = L4_generate_backend_runtime('services/app/' + name, use_golden = False, use_prisma = False, manifest = manifest)

r = {'entries': entries, 'l4': l4}
"""


def run_tilt(tmp_path: Path, body: str) -> dict:
    project_root = tmp_path / "healthcheck-project"
    (project_root / ".flisk").mkdir(parents=True, exist_ok=True)
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "healthcheck-project"}}))
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
    return run_tilt(tmp_path_factory.mktemp("healthcheck"), COMPOSE_BODY)


DISABLED = "    healthcheck:\n      disable: true\n"


def test_backend_without_healthcheck_keeps_the_default_probe(result):
    entry = result["entries"]["plain"]
    assert 'test: ["CMD", "curl", "-f", "--max-time", "5", "http://localhost:4000/health"]' in entry
    assert "      interval: 30s\n" in entry
    assert "loadbalancer.healthcheck.path=/health" in entry
    assert DISABLED not in entry


@pytest.mark.parametrize("name", ["off", "off-obj"])
def test_healthcheck_false_disables_container_and_traefik_probes(result, name):
    entry = result["entries"][name]
    # The image's own HEALTHCHECK is switched off too, not just left out.
    assert DISABLED in entry
    assert "curl" not in entry
    assert "loadbalancer.healthcheck" not in entry
    assert "FLISK_HEALTH_PATH" not in entry
    # The service keeps its route and port: only the probes are gone.
    assert '      - "traefik.enable=true"' in entry
    assert "      - PORT=4000\n" in entry


def test_healthcheck_object_sets_path_and_timing(result):
    entry = result["entries"]["custom"]
    assert '"http://localhost:4000/livez"]' in entry
    assert "      interval: 7s\n      timeout: 3s\n      retries: 5\n" in entry
    assert "      - FLISK_HEALTH_PATH=/livez\n" in entry
    assert "loadbalancer.healthcheck.path=/livez" in entry


def test_healthcheck_timing_without_path_keeps_the_default_path(result):
    entry = result["entries"]["timed"]
    assert '"http://localhost:4000/health"]' in entry
    assert "      interval: 9s\n      timeout: 5s\n      retries: 3\n" in entry


def test_l4_image_healthcheck_follows_healthcheck(result):
    assert "HEALTHCHECK NONE" in result["l4"]["off"]
    assert "HEALTHCHECK NONE" in result["l4"]["off-obj"]
    assert "127.0.0.1:4000/livez" in result["l4"]["custom"]
    assert "127.0.0.1:4000/health" in result["l4"]["plain"]
    assert "HEALTHCHECK NONE" not in result["l4"]["plain"]
