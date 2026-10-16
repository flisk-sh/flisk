# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
"""
An `agent` resource is normalised to a backend, and its files durability gets a named state volume.

Runs the real loader and Compose generators through Tilt's interpreter (`tilt alpha tiltfile-result`), like
test_compose_project_scoping.py. The asserts are on what Compose receives, not on the Starlark text.
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
ENGINE_ROOT = REPO_ROOT / "engine"
RESULT_MARKER = "Error in fail: RESULT"

AGENT_SERVICE_JSON = {
    "appName": "bot",
    "appType": "agent",
    "stack": "shop",
    "port": 4010,
    "healthCheckPath": "/health",
    "agent": {"runtime": "custom", "durability": "files"},
}

LOADER_BODY = """
load('@ENGINE/topologies/tilt/manifest/loader.star', 'load_from_file')

loaded = load_from_file('services/shop/bot/service.json')
r = {'manifest': loaded.manifest, 'error': loaded.error}
"""

COMPOSE_BODY = """
load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry', 'generate_app_compose_from_entries')

stack = 'shop'
files_manifest = {'appType': 'backend', 'stack': stack, 'port': 4010, 'healthCheckPath': '/health',
                  'agent': {'runtime': 'custom', 'durability': 'files'}}
postgres_manifest = {'appType': 'backend', 'stack': stack, 'port': 4011, 'healthCheckPath': '/health',
                     'agent': {'runtime': 'custom', 'durability': 'postgres'}}
plain_manifest = {'appType': 'backend', 'stack': stack, 'port': 4012, 'healthCheckPath': '/health'}

files_entry = generate_backend_compose_entry('services/shop/bot', stack, {'name': 'bot', 'port': 4010}, files_manifest)
postgres_entry = generate_backend_compose_entry('services/shop/pg-bot', stack, {'name': 'pg-bot', 'port': 4011}, postgres_manifest)
plain_entry = generate_backend_compose_entry('services/shop/api', stack, {'name': 'api', 'port': 4012}, plain_manifest)
r = {
    'files_yaml': generate_app_compose_from_entries('services/shop', [files_entry]),
    'postgres_yaml': generate_app_compose_from_entries('services/shop', [postgres_entry]),
    'plain_yaml': generate_app_compose_from_entries('services/shop', [plain_entry]),
}
"""


def run_tilt(tmp_path: Path, body: str) -> dict:
    project_root = tmp_path / "agent-project"
    (project_root / ".tdk").mkdir(parents=True, exist_ok=True)
    (project_root / ".tdk" / "project.json").write_text(json.dumps({"project": {"name": "agent-project"}}))
    service_dir = project_root / "services" / "shop" / "bot"
    service_dir.mkdir(parents=True, exist_ok=True)
    (service_dir / "service.json").write_text(json.dumps(AGENT_SERVICE_JSON))
    tiltfile = project_root / "Tiltfile"
    tiltfile.write_text(body.replace("@ENGINE", str(ENGINE_ROOT)) + "\nfail('RESULT' + encode_json(r))\n")
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=180,
        cwd=project_root,
        env={**os.environ, "TDK_PROJECT_ROOT": str(project_root)},
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@TILT_REQUIRED
def test_loader_normalises_an_agent_to_a_backend_and_keeps_its_settings(tmp_path):
    result = run_tilt(tmp_path, LOADER_BODY)

    assert result["error"] is None, result["error"]
    manifest = result["manifest"]
    assert manifest["appType"] == "backend"
    assert manifest["agent"] == {"runtime": "custom", "durability": "files"}


@TILT_REQUIRED
def test_files_durability_mounts_a_named_volume_declared_at_the_top_level(tmp_path):
    result = run_tilt(tmp_path, COMPOSE_BODY)
    yaml_text = result["files_yaml"]

    assert "    volumes:\n      - bot-agent-state:/var/lib/tdk-agent\n" in yaml_text
    assert "      - AGENT_DURABILITY=files\n" in yaml_text
    assert "      - AGENT_STATE_DIR=/var/lib/tdk-agent\n" in yaml_text
    assert "\nvolumes:\n  bot-agent-state:\n" in yaml_text
    # The backend path is unchanged: health check and Traefik route.
    assert "traefik.enable=true" in yaml_text or "traefik." in yaml_text
    assert "/health" in yaml_text


@TILT_REQUIRED
def test_postgres_durability_takes_the_database_and_no_volume(tmp_path):
    result = run_tilt(tmp_path, COMPOSE_BODY)
    yaml_text = result["postgres_yaml"]

    assert "      - AGENT_DURABILITY=postgres\n" in yaml_text
    assert "AGENT_STATE_DIR" not in yaml_text
    assert "agent-state" not in yaml_text
    assert "DATABASE_URL=" in yaml_text


@TILT_REQUIRED
def test_an_ordinary_backend_gets_no_agent_volume_or_environment(tmp_path):
    result = run_tilt(tmp_path, COMPOSE_BODY)
    yaml_text = result["plain_yaml"]

    assert "AGENT_" not in yaml_text
    assert "agent-state" not in yaml_text
    assert "\nvolumes:" not in yaml_text
