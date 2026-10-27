# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
A bring-your-own resource with `containerPort` keeps the port its container already listens on.

`flisk import` gives an imported Compose service a Flisk port in 4000-5999, but the app inside still listens on the
port from docker-compose.yml (often 3000). Without containerPort the generated PORT and the Traefik target were the
Flisk port, so the imported app never answered. Runs the real Compose generator through Tilt's interpreter.
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

COMPOSE_BODY = """
load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry')

byo = {'appType': 'bring-your-own', 'stack': 'shop', 'port': 4001, 'containerPort': 3000, 'healthCheckPath': '/', 'image': 'example/api:1'}
plain = {'appType': 'bring-your-own', 'stack': 'shop', 'port': 4002, 'healthCheckPath': '/', 'image': 'example/web:1'}
backend = {'appType': 'backend', 'stack': 'shop', 'port': 4003, 'containerPort': 3000, 'healthCheckPath': '/health'}
r = {
    'byo': generate_backend_compose_entry('services/shop', 'shop', {'name': 'api'}, byo),
    'plain': generate_backend_compose_entry('services/shop', 'shop', {'name': 'web'}, plain),
    'backend': generate_backend_compose_entry('services/shop', 'shop', {'name': 'orders'}, backend),
}
"""


@pytest.fixture(scope="module")
def result(tmp_path_factory) -> dict:
    if shutil.which("tilt") is None:
        pytest.skip("tilt CLI not installed")
    project_root = tmp_path_factory.mktemp("container-port") / "shop-project"
    (project_root / ".flisk").mkdir(parents=True)
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "shop-project"}}))
    tiltfile = project_root / "Tiltfile"
    tiltfile.write_text(COMPOSE_BODY.replace("@ENGINE", str(ENGINE_ROOT)) + "\nfail('RESULT' + encode_json(r))\n")
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


@TILT_REQUIRED
def test_byo_container_port_sets_port_env_and_traefik_target(result):
    entry = result["byo"]

    assert "      - PORT=3000\n" in entry
    assert "loadbalancer.server.port=3000" in entry
    assert "PORT=4001" not in entry
    assert "loadbalancer.server.port=4001" not in entry


@TILT_REQUIRED
def test_byo_without_container_port_still_listens_on_its_flisk_port(result):
    entry = result["plain"]

    assert "      - PORT=4002\n" in entry
    assert "loadbalancer.server.port=4002" in entry


@TILT_REQUIRED
def test_container_port_is_ignored_outside_bring_your_own(result):
    entry = result["backend"]

    assert "      - PORT=4003\n" in entry
    assert "PORT=3000" not in entry


ALIAS_BODY = """
load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry')

db = {'appType': 'bring-your-own', 'stack': 'shop', 'port': 4000, 'image': 'postgres:16-alpine', 'exposeViaProxy': False, 'networkAliases': ['db']}
web = {'appType': 'bring-your-own', 'stack': 'shop', 'port': 4002, 'healthCheckPath': '/', 'image': 'example/web:1'}
r = {
    'db': generate_backend_compose_entry('services/shop', 'shop', {'name': 'db-svc'}, db),
    'web': generate_backend_compose_entry('services/shop', 'shop', {'name': 'web'}, web),
}
"""


@pytest.fixture(scope="module")
def aliases(tmp_path_factory) -> dict:
    if shutil.which("tilt") is None:
        pytest.skip("tilt CLI not installed")
    project_root = tmp_path_factory.mktemp("aliases") / "shop-project"
    (project_root / ".flisk").mkdir(parents=True)
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "shop-project"}}))
    tiltfile = project_root / "Tiltfile"
    tiltfile.write_text(ALIAS_BODY.replace("@ENGINE", str(ENGINE_ROOT)) + "\nfail('RESULT' + encode_json(r))\n")
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


@TILT_REQUIRED
def test_byo_network_aliases_keep_the_compose_hostname_on_every_network(aliases):
    entry = aliases["db"]
    networks = entry.split("    networks:\n", 1)[1]

    assert networks.count("        aliases:\n          - db\n") == 4


@TILT_REQUIRED
def test_byo_without_aliases_keeps_the_plain_network_list(aliases):
    networks = aliases["web"].split("    networks:\n", 1)[1]

    assert "aliases:" not in networks
    assert networks.startswith("      - ")
