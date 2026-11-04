# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Readiness by an open TCP port or a command, not only an HTTP path (#2875).

`healthCheck.port` and `healthCheck.command` replace the HTTP probe: the compose healthcheck probes the port or runs the
command, there is no curl probe, no FLISK_HEALTH_PATH and no Traefik HTTP health check. Renders the real generators
through Tilt's interpreter; with Docker installed, a real container must turn healthy through the generated port probe.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import pytest

from test_migrator_compose import ENGINE_ROOT, RESULT_MARKER, TILT_REQUIRED, run_tilt

pytestmark = [pytest.mark.generator]
DOCKER_REQUIRED = pytest.mark.skipif(shutil.which("docker") is None, reason="docker CLI not installed")

COMPOSE_BODY = """
load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry')
load('@ENGINE/topologies/platform/docker/layers/l4_runtime_layers.star', 'L4_generate_backend_runtime')

base = {'appType': 'backend', 'stack': 'app', 'port': 4000}
manifests = {
    'grpc': dict(base, healthCheck={'port': 9090, 'interval': 5}),
    'checked': dict(base, healthCheck={'command': ['grpc_health_probe', '-addr=:9090']}),
    'byo': {'appType': 'bring-your-own', 'stack': 'app', 'port': 5000, 'image': 'redis:7', 'healthCheck': {'port': 6379}},
    'plain': dict(base, healthCheckPath='/health'),
}
r = {name: generate_backend_compose_entry('services/app', 'app', {'name': name}, m) for name, m in manifests.items()}
r['dockerfile_grpc'] = L4_generate_backend_runtime('services/app/grpc', use_golden = False, use_prisma = False, manifest = manifests['grpc'])
"""


@pytest.fixture(scope="module")
def result(tmp_path_factory) -> dict:
    if shutil.which("tilt") is None:
        pytest.skip("tilt CLI not installed")
    return run_tilt(tmp_path_factory.mktemp("probe"), COMPOSE_BODY)


def _test_line(entry: str) -> list[str]:
    line = next(line for line in entry.splitlines() if line.strip().startswith("test: "))
    return json.loads(line.strip()[len("test: "):])


@TILT_REQUIRED
def test_a_port_probe_replaces_the_http_probe(result):
    entry = result["grpc"]
    test = _test_line(entry)
    assert test[0] == "CMD-SHELL"
    assert test[1].startswith("nc -z 127.0.0.1 9090 2>/dev/null || bash -c '</dev/tcp/127.0.0.1/9090'")
    assert "connect(9090,'127.0.0.1')" in test[1]
    assert "curl" not in entry
    assert "FLISK_HEALTH_PATH" not in entry
    assert "healthcheck.path" not in entry
    # The service's own timing still applies.
    assert "      interval: 5s\n" in entry


@TILT_REQUIRED
def test_a_command_probe_runs_the_command_in_exec_form(result):
    entry = result["checked"]
    assert _test_line(entry) == ["CMD", "grpc_health_probe", "-addr=:9090"]
    assert "curl" not in entry
    assert "healthcheck.path" not in entry


@TILT_REQUIRED
def test_a_bring_your_own_service_gets_its_port_probe(result):
    assert _test_line(result["byo"])[1].startswith("nc -z 127.0.0.1 6379")


@TILT_REQUIRED
def test_an_http_service_is_unchanged(result):
    entry = result["plain"]
    assert 'test: ["CMD", "curl", "-f", "--max-time", "5", "http://localhost:4000/health"]' in entry
    assert "FLISK_HEALTH_PATH=/health" in entry


@TILT_REQUIRED
def test_the_image_leaves_the_probe_to_compose(result):
    assert "HEALTHCHECK NONE" in result["dockerfile_grpc"]


@TILT_REQUIRED
@pytest.mark.parametrize(
    ("health_check", "message"),
    [
        ({"path": "/health", "port": 9090}, "set only one of 'healthCheck.path', 'healthCheck.port' or 'healthCheck.command'"),
        ({"port": 70000}, "'healthCheck.port' must be a port from 1 to 65535"),
        ({"command": []}, "'healthCheck.command' must be the program and its arguments"),
    ],
)
def test_a_wrong_probe_stops_the_tiltfile(tmp_path, health_check, message):
    project = tmp_path / "p"
    (project / ".flisk").mkdir(parents=True)
    (project / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "p"}}))
    tiltfile = project / "Tiltfile"
    tiltfile.write_text(
        f"load('{ENGINE_ROOT}/topologies/platform/docker/config/healthcheck.star', 'manifest_health_check')\n"
        f"manifest_health_check({{'healthCheck': {health_check!r}}})\n"
        "fail('RESULT{}')\n"
    )
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=120,
        cwd=project,
        env={**os.environ, "FLISK_PROJECT_ROOT": str(project)},
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER not in output
    assert message in output


@TILT_REQUIRED
@DOCKER_REQUIRED
def test_a_container_turns_healthy_through_the_generated_port_probe(result, tmp_path):
    """The probe text survives YAML and Compose, and passes once something listens on the port (busybox nc here)."""
    test = _test_line(result["grpc"])
    compose = {
        "services": {
            "svc": {
                "image": "alpine:3.20",
                "command": ["sh", "-c", "sleep 2; while true; do nc -l -p 9090 >/dev/null 2>&1; done"],
                "healthcheck": {"test": test, "interval": "1s", "timeout": "3s", "retries": 30, "start_period": "1s"},
            }
        }
    }
    file = tmp_path / "compose.yml"
    file.write_text(json.dumps(compose))
    project = f"flisk-probe-{os.getpid()}"
    base = ["docker", "compose", "-p", project, "-f", str(file)]
    try:
        up = subprocess.run([*base, "up", "-d"], capture_output=True, text=True, timeout=180)
        assert up.returncode == 0, up.stderr[-2000:]
        status = ""
        for _ in range(60):
            status = subprocess.run(
                ["docker", "inspect", "-f", "{{.State.Health.Status}}", f"{project}-svc-1"],
                capture_output=True,
                text=True,
            ).stdout.strip()
            if status == "healthy":
                break
            time.sleep(1)
        assert status == "healthy"
    finally:
        subprocess.run([*base, "down", "-t", "0"], capture_output=True, timeout=120)
