# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
`sidecarOf` in a bring-your-own service.json shares another resource's network namespace (#2908).

tubehaus runs the bgutil PO-token server with `network_mode: "service:tubehaus"`, so yt-dlp inside tubehaus reaches it on
127.0.0.1:4416. `flisk-import@0.4.1` dropped `network_mode`, and the sidecar then ran on its own network, where 127.0.0.1 is the
wrong host. A container in another one's namespace cannot join networks, publish ports or take a Traefik route.

Runs the real generators through Tilt's interpreter (`tilt alpha tiltfile-result`), like test_migrator_compose.py.
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

LOAD = (
    "load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry', 'generate_app_compose_from_entries')\n"
    "load('@ENGINE/topologies/tilt/common/dependencies.star', 'declared_dependencies')\n"
)

COMPOSE_BODY = LOAD + """
host = {'appName': 'tubehaus', 'appType': 'bring-your-own', 'stack': 'tube', 'port': 3010, 'healthCheckPath': '/api/p/health', 'image': 'ghcr.io/biolend83/tubehaus:latest'}
sidecar = {'appName': 'bgutil', 'appType': 'bring-your-own', 'stack': 'tube', 'port': 4416, 'image': 'brainicism/bgutil-ytdlp-pot-provider', 'sidecarOf': 'tubehaus'}
entries = [
    generate_backend_compose_entry('services/tube', 'tube', {'name': 'tubehaus'}, host),
    generate_backend_compose_entry('services/tube', 'tube', {'name': 'bgutil'}, sidecar),
]
r = {
    'host': entries[0],
    'sidecar': entries[1],
    'yaml': generate_app_compose_from_entries('services/tube', entries),
}
"""


def run_tilt(tmp_path: Path, body: str) -> str:
    project_root = tmp_path / "sidecar-project"
    (project_root / ".flisk").mkdir(parents=True, exist_ok=True)
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "sidecar-project"}}))
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
    output = run_tilt(tmp_path_factory.mktemp("sidecar"), COMPOSE_BODY)
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@TILT_REQUIRED
def test_the_sidecar_shares_the_host_network_and_joins_no_other(result):
    entry = result["sidecar"]

    assert '    network_mode: "service:tubehaus"\n' in entry
    assert "    networks:\n" not in entry
    assert "ports:" not in entry


@TILT_REQUIRED
def test_the_sidecar_gets_no_route_of_its_own(result):
    entry = result["sidecar"]

    assert '      - "traefik.enable=false"' in entry
    assert "traefik.http." not in entry


@TILT_REQUIRED
def test_the_host_keeps_its_networks_and_route(result):
    entry = result["host"]

    assert "network_mode" not in entry
    assert "    networks:\n      - " in entry
    assert '      - "traefik.enable=true"' in entry


@TILT_REQUIRED
def test_the_stack_file_still_declares_the_networks(result):
    assert result["yaml"].count("network_mode:") == 1
    assert "\nnetworks:\n" in result["yaml"]


@TILT_REQUIRED
def test_a_sidecar_starts_after_its_host(tmp_path):
    body = LOAD + (
        "m = {'appName': 'bgutil', 'appType': 'bring-your-own', 'stack': 'tube', 'port': 4416, 'image': 'x:1', "
        "'sidecarOf': 'tubehaus', 'dependsOn': ['postgres']}\n"
        "r = declared_dependencies(m)\n"
    )
    output = run_tilt(tmp_path, body)

    assert RESULT_MARKER in output, output[-2000:]
    assert json.loads(output.split(RESULT_MARKER, 1)[1].strip()) == ["postgres", "tubehaus"]


@TILT_REQUIRED
@pytest.mark.parametrize(
    "fields, message",
    [
        ("'sidecarOf': 'Tube Haus'", "'sidecarOf' must be the appName"),
        ("'sidecarOf': 'x\\nprivileged: true'", "'sidecarOf' must be the appName"),
        ("'sidecarOf': 'bgutil'", "cannot name the resource itself"),
        ("'sidecarOf': 'tubehaus', 'extraPorts': [{'port': 4416}]", "a sidecar has no ports of its own"),
        ("'sidecarOf': 'tubehaus', 'replicas': 2", "needs a single container"),
    ],
)
def test_a_bad_sidecar_stops_generation(tmp_path, fields, message):
    body = LOAD + (
        "m = {{'appName': 'bgutil', 'appType': 'bring-your-own', 'stack': 'tube', 'port': 4416, 'image': 'x:1', {}}}\n"
        "r = generate_backend_compose_entry('services/tube', 'tube', {{'name': 'bgutil'}}, m)\n"
    ).format(fields)
    output = run_tilt(tmp_path, body)

    assert FAIL_MARKER in output and message in output, output[-2000:]
    assert RESULT_MARKER not in output
