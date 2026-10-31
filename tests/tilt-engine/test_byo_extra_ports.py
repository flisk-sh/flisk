# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
`extraPorts` in a bring-your-own service.json publishes plain host ports next to the routed port (#2909).

A reverse proxy such as Caddy listens on 80 and 443, and the tubehaus server has a SOCKS port (1080) next to HTTP (3010).
`flisk-import@0.4.1` skipped such services ("lists several ports (80, 443)"). Each extra port is published on 127.0.0.1 only.

Runs the real Compose generator through Tilt's interpreter (`tilt alpha tiltfile-result`), like test_migrator_compose.py.
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
FAIL_MARKER = "MANIFEST ERROR"

LOAD = "load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry', 'generate_app_compose_from_entries')\n"

COMPOSE_BODY = LOAD + """
caddy = {
    'appType': 'bring-your-own', 'stack': 'tube', 'port': 8080, 'image': 'caddy:2',
    'extraPorts': [{'port': 80, 'hostPort': 8081}, {'port': 443}, {'port': 443, 'protocol': 'udp'}],
}
server = {'appType': 'bring-your-own', 'stack': 'tube', 'port': 3010, 'image': 'ghcr.io/biolend83/tubehaus:latest', 'extraPorts': [{'port': 1080}]}
plain = {'appType': 'bring-your-own', 'stack': 'tube', 'port': 9000, 'image': 'nginx:alpine'}
backend = {'appType': 'backend', 'stack': 'tube', 'port': 4000, 'extraPorts': [{'port': 1080}]}
entries = [
    generate_backend_compose_entry('services/tube', 'tube', {'name': 'caddy'}, caddy),
    generate_backend_compose_entry('services/tube', 'tube', {'name': 'tubehaus'}, server),
]
r = {
    'caddy': entries[0],
    'server': entries[1],
    'plain': generate_backend_compose_entry('services/tube', 'tube', {'name': 'plain'}, plain),
    'backend': generate_backend_compose_entry('services/tube', 'tube', {'name': 'api'}, backend),
    'yaml': generate_app_compose_from_entries('services/tube', entries),
}
"""


def run_tilt(tmp_path: Path, body: str) -> str:
    project_root = tmp_path / "ports-project"
    (project_root / ".flisk").mkdir(parents=True, exist_ok=True)
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "ports-project"}}))
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
    output = run_tilt(tmp_path_factory.mktemp("ports"), COMPOSE_BODY)
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@TILT_REQUIRED
def test_a_proxy_publishes_80_and_443_on_loopback_only(result):
    entry = result["caddy"]

    assert (
        "    ports:\n"
        '      - "127.0.0.1:8081:80/tcp"\n'
        '      - "127.0.0.1:443:443/tcp"\n'
        '      - "127.0.0.1:443:443/udp"\n'
    ) in entry
    # The routed port still goes through Traefik, not a host port.
    assert "127.0.0.1:8080" not in entry
    assert '      - "traefik.enable=true"' in entry


@TILT_REQUIRED
def test_a_second_listener_is_published_next_to_http(result):
    assert '      - "127.0.0.1:1080:1080/tcp"\n' in result["server"]


@TILT_REQUIRED
def test_services_without_extra_ports_publish_nothing(result):
    assert "ports:" not in result["plain"]
    # Only bring-your-own resources read extraPorts; the CLI reports it on other types.
    assert "ports:" not in result["backend"]


@TILT_REQUIRED
def test_the_stack_file_has_one_ports_block_per_service(result):
    assert result["yaml"].count("    ports:\n") == 2


@TILT_REQUIRED
@pytest.mark.parametrize(
    "fields, message",
    [
        ("'extraPorts': [{'port': 0}]", "'extraPorts[0].port' must be a port number"),
        ("'extraPorts': [{'port': '80'}]", "'extraPorts[0].port' must be a port number"),
        ("'extraPorts': [{'port': 53, 'protocol': 'sctp'}]", "'extraPorts[0].protocol' must be tcp or udp"),
        ("'extraPorts': [{'port': 80}, {'port': 8080, 'hostPort': 80}]", "is published twice"),
        ("'extraPorts': [{'port': 80}], 'replicas': 2", "needs a single container"),
    ],
)
def test_a_bad_extra_port_stops_generation(tmp_path, fields, message):
    body = LOAD + (
        "m = {{'appType': 'bring-your-own', 'stack': 'tube', 'port': 9000, 'image': 'nginx:alpine', {}}}\n"
        "r = generate_backend_compose_entry('services/tube', 'tube', {{'name': 'bad'}}, m)\n"
    ).format(fields)
    output = run_tilt(tmp_path, body)

    assert FAIL_MARKER in output and message in output, output[-2000:]
    assert RESULT_MARKER not in output
