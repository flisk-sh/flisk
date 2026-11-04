# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
GPUs, CPU and memory limits and IPC in a bring-your-own `container` block become the Compose `deploy:` and `ipc:` keys.

A container Flisk builds gets its default limits (0.5 CPU, 512M). A bring-your-own container gets none unless `container.cpus`
or `container.memory` is set (#2992): a vLLM or Ollama model server, a cuQuantum or large state-vector simulator, or an image that
loads a model at start was OOM-killed by the default, and none of them can see a GPU without a device reservation.

Runs the real Compose generator through Tilt's interpreter (`tilt alpha tiltfile-result`), like test_byo_container_options.py.
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

LOAD = "load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry')\n"

COMPOSE_BODY = LOAD + """
vllm = {
    'appType': 'bring-your-own', 'stack': 'hqc', 'port': 8000, 'image': 'vllm/vllm-openai:latest',
    'container': {'gpus': 'all', 'cpus': 8, 'memory': '32g', 'ipc': 'host', 'shmSize': '16g'},
}
sim = {
    'appType': 'bring-your-own', 'stack': 'hqc', 'port': 4502, 'image': 'example/aer-gpu:1',
    'container': {'gpus': 1, 'cpus': '2.5'},
}
small = {
    'appType': 'bring-your-own', 'stack': 'hqc', 'port': 4503, 'image': 'redis:7-alpine',
    'container': {'cpus': '0.1', 'memory': '128m'},
}
plain = {'appType': 'bring-your-own', 'stack': 'hqc', 'port': 9000, 'image': 'nginx:alpine'}
memory_only = {'appType': 'bring-your-own', 'stack': 'hqc', 'port': 9001, 'image': 'example/facial:1', 'container': {'memory': '4G'}}
gpu_only = {'appType': 'bring-your-own', 'stack': 'hqc', 'port': 9002, 'image': 'example/gpu:1', 'container': {'gpus': 1}}
backend = {'appType': 'backend', 'stack': 'hqc', 'port': 4000, 'container': {'gpus': 'all'}}
r = {
    'vllm': generate_backend_compose_entry('services/hqc', 'hqc', {'name': 'vllm'}, vllm),
    'sim': generate_backend_compose_entry('services/hqc', 'hqc', {'name': 'quantum-sim'}, sim),
    'small': generate_backend_compose_entry('services/hqc', 'hqc', {'name': 'cache'}, small),
    'plain': generate_backend_compose_entry('services/hqc', 'hqc', {'name': 'plain'}, plain),
    'memory_only': generate_backend_compose_entry('services/hqc', 'hqc', {'name': 'memory-only'}, memory_only),
    'gpu_only': generate_backend_compose_entry('services/hqc', 'hqc', {'name': 'gpu-only'}, gpu_only),
    'backend': generate_backend_compose_entry('services/hqc', 'hqc', {'name': 'api'}, backend),
}
"""

DEFAULT_DEPLOY = """    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.2'
          memory: 256M
"""


def run_tilt(tmp_path: Path, body: str) -> str:
    project_root = tmp_path / "gpu-project"
    (project_root / ".flisk").mkdir(parents=True, exist_ok=True)
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "gpu-project"}}))
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
    output = run_tilt(tmp_path_factory.mktemp("gpu"), COMPOSE_BODY)
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@TILT_REQUIRED
def test_a_model_server_gets_every_gpu_its_limits_and_host_ipc(result):
    entry = result["vllm"]

    assert """    deploy:
      resources:
        limits:
          cpus: '8'
          memory: 32g
        reservations:
          cpus: '0.2'
          memory: 256M
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
""" in entry
    assert '    ipc: "host"\n' in entry
    assert '    shm_size: "16g"\n' in entry


@TILT_REQUIRED
def test_a_simulator_reserves_a_gpu_count_and_sets_no_memory_limit(result):
    entry = result["sim"]

    assert "          cpus: '2.5'\n" in entry
    assert "memory:" not in entry.split("    deploy:", 1)[1]
    assert "              count: 1\n" in entry
    assert "ipc:" not in entry


@TILT_REQUIRED
def test_a_reservation_never_exceeds_a_smaller_limit(result):
    # Compose refuses a reservation above its limit, so a limit under the default reservation lowers the reservation too.
    entry = result["small"]

    assert """        limits:
          cpus: '0.1'
          memory: 128m
        reservations:
          cpus: '0.1'
          memory: 128m
""" in entry
    assert "devices:" not in entry


@TILT_REQUIRED
def test_a_service_without_these_keys_has_no_limits(result):
    # #2992: no hidden 512M. An image that works under plain Compose is not OOM-killed by Flisk.
    assert "deploy:" not in result["plain"]
    assert "memory:" not in result["plain"] and "cpus:" not in result["plain"]
    assert "devices:" not in result["plain"]


@TILT_REQUIRED
def test_only_the_limit_that_is_set_is_written(result):
    memory_only = result["memory_only"]

    assert "        limits:\n          memory: 4G\n        reservations:\n          memory: 256M\n" in memory_only
    assert "cpus:" not in memory_only
    gpu_only = result["gpu_only"]
    assert "        limits:" not in gpu_only
    assert "    deploy:\n      resources:\n        reservations:\n          devices:\n" in gpu_only


@TILT_REQUIRED
def test_gpus_are_ignored_on_a_resource_flisk_builds(result):
    # The CLI reports it (containerErrors); the generator keeps Flisk's own limits.
    assert DEFAULT_DEPLOY in result["backend"]
    assert "devices:" not in result["backend"]


@TILT_REQUIRED
@pytest.mark.parametrize(
    "container, message",
    [
        ("{'gpus': 0}", "'container.gpus' must be"),
        ("{'gpus': 'nvidia'}", "'container.gpus' must be"),
        ("{'cpus': '4\\nprivileged: true'}", "'container.cpus' must be"),
        ("{'cpus': '0'}", "'container.cpus' must be"),
        ("{'memory': 'lots'}", "'container.memory' must be"),
        ("{'ipc': 'container:other'}", "'container.ipc' must be one of"),
    ],
)
def test_a_value_that_could_add_yaml_keys_stops_generation(tmp_path, container, message):
    body = LOAD + (
        "m = {{'appType': 'bring-your-own', 'stack': 'hqc', 'port': 9000, 'image': 'nginx:alpine', 'container': {}}}\n"
        "r = generate_backend_compose_entry('services/hqc', 'hqc', {{'name': 'bad'}}, m)\n"
    ).format(container)
    output = run_tilt(tmp_path, body)

    assert FAIL_MARKER in output and message in output, output[-2000:]
    assert RESULT_MARKER not in output
