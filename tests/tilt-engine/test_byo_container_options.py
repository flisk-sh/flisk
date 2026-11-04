# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
`container` in a bring-your-own service.json becomes Compose runtime options (#2907).

Real Compose files rely on cap_add, init, cap_drop, read_only, user, security_opt and shm_size. Without them a bring-your-own
image either does not work (a WARP client without NET_ADMIN never connects) or loses its hardening, so `flisk import` could not
carry such a service over. The fixture is invidious-companion and the tubehaus server from biolend83/tubehaus.

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

LOAD = "load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry')\n"

COMPOSE_BODY = LOAD + """
companion = {
    'appType': 'bring-your-own', 'stack': 'tube', 'port': 8282, 'image': 'quay.io/invidious/invidious-companion:latest',
    'container': {
        'capDrop': ['ALL'], 'readOnly': True, 'user': '10001:10001',
        'securityOpt': ['no-new-privileges:true'], 'shmSize': '256mb',
    },
}
server = {
    'appType': 'bring-your-own', 'stack': 'tube', 'port': 3010, 'image': 'ghcr.io/biolend83/tubehaus:latest',
    'container': {'capAdd': ['NET_ADMIN'], 'init': False},
}
plain = {'appType': 'bring-your-own', 'stack': 'tube', 'port': 9000, 'image': 'nginx:alpine'}
backend = {'appType': 'backend', 'stack': 'tube', 'port': 4000, 'container': {'capAdd': ['NET_ADMIN']}}
r = {
    'companion': generate_backend_compose_entry('services/tube', 'tube', {'name': 'companion'}, companion),
    'server': generate_backend_compose_entry('services/tube', 'tube', {'name': 'tubehaus'}, server),
    'plain': generate_backend_compose_entry('services/tube', 'tube', {'name': 'plain'}, plain),
    'backend': generate_backend_compose_entry('services/tube', 'tube', {'name': 'api'}, backend),
}
"""


def run_tilt(tmp_path: Path, body: str) -> str:
    project_root = tmp_path / "container-project"
    (project_root / ".flisk").mkdir(parents=True, exist_ok=True)
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "container-project"}}))
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
    output = run_tilt(tmp_path_factory.mktemp("container"), COMPOSE_BODY)
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@TILT_REQUIRED
def test_the_companion_keeps_its_hardening(result):
    entry = result["companion"]

    assert "    cap_drop:\n      - ALL\n" in entry
    assert "    read_only: true\n" in entry
    assert '    user: "10001:10001"\n' in entry
    assert '    security_opt:\n      - "no-new-privileges:true"\n' in entry
    assert '    shm_size: "256mb"\n' in entry
    assert "    init: true\n" in entry


@TILT_REQUIRED
def test_a_vpn_client_gets_net_admin_and_can_turn_init_off(result):
    entry = result["server"]

    assert "    cap_add:\n      - NET_ADMIN\n" in entry
    assert "    init: false\n" in entry
    assert "cap_drop" not in entry


@TILT_REQUIRED
def test_a_service_without_container_is_generated_as_before(result):
    entry = result["plain"]

    assert "    init: true\n    restart: unless-stopped\n" in entry
    for key in ["cap_add", "cap_drop", "read_only", "user:", "security_opt", "shm_size"]:
        assert key not in entry


@TILT_REQUIRED
def test_container_is_ignored_on_a_resource_flisk_builds(result):
    # The CLI reports it (containerErrors); the generator keeps Flisk's own image settings.
    assert "cap_add" not in result["backend"]


@TILT_REQUIRED
@pytest.mark.parametrize(
    "container, message",
    [
        ("{'capAdd': ['net_admin']}", "'container.capAdd' entries must be"),
        ("{'user': 'root\\nprivileged: true'}", "'container.user' must be"),
        ("{'shmSize': 'lots'}", "'container.shmSize' must be"),
        ("{'readOnly': 'yes'}", "'container.readOnly' must be"),
    ],
)
def test_a_value_that_could_add_yaml_keys_stops_generation(tmp_path, container, message):
    body = LOAD + (
        "m = {{'appType': 'bring-your-own', 'stack': 'tube', 'port': 9000, 'image': 'nginx:alpine', 'container': {}}}\n"
        "r = generate_backend_compose_entry('services/tube', 'tube', {{'name': 'bad'}}, m)\n"
    ).format(container)
    output = run_tilt(tmp_path, body)

    assert FAIL_MARKER in output and message in output, output[-2000:]
    assert RESULT_MARKER not in output


COMMAND_BODY = (
    "load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry', 'generate_app_compose_from_entries')\n"
    + """
mlflow = {
    'appType': 'bring-your-own', 'stack': 'ml', 'port': 5000, 'image': 'ghcr.io/mlflow/mlflow:v3.17.2',
    'container': {'command': ['sh', '-c', 'if [ -n "$$AWS_ENDPOINT_URL_S3" ]; then D=s3://mlflow; fi; exec mlflow server --artifacts-destination "$$D"']},
}
entries = [generate_backend_compose_entry('services/ml', 'ml', {'name': 'mlflow'}, mlflow)]
r = {'entry': entries[0], 'yaml': generate_app_compose_from_entries('services/ml', entries)}
"""
)


@TILT_REQUIRED
def test_command_is_written_as_a_compose_list(tmp_path):
    output = run_tilt(tmp_path, COMMAND_BODY)
    assert RESULT_MARKER in output, output[-3000:]
    entry = json.loads(output.split(RESULT_MARKER, 1)[1].strip())["entry"]

    assert '    command: [' in entry
    assert '"sh"' in entry and '\\"$$AWS_ENDPOINT_URL_S3\\"' in entry


@TILT_REQUIRED
@pytest.mark.skipif(shutil.which("docker") is None, reason="docker CLI not installed")
def test_compose_reads_command_and_keeps_the_escaped_dollar(tmp_path):
    output = run_tilt(tmp_path, COMMAND_BODY)
    assert RESULT_MARKER in output, output[-3000:]
    yaml_text = json.loads(output.split(RESULT_MARKER, 1)[1].strip())["yaml"]
    stack = tmp_path / "container-project" / "services" / "ml"
    (stack / ".autogenerated").mkdir(parents=True, exist_ok=True)
    (stack / "mlflow" / ".autogenerated").mkdir(parents=True, exist_ok=True)
    (stack / "mlflow" / ".autogenerated" / ".env.backend.autogenerated").write_text("")
    compose_file = stack / ".autogenerated" / "docker-compose.app.autogenerated.yml"
    compose_file.write_text(yaml_text)
    proc = subprocess.run(
        ["docker", "compose", "-p", "cmdproject", "-f", str(compose_file), "config", "--format", "json"],
        capture_output=True,
        text=True,
        timeout=60,
        env={**os.environ, "SERVER_SECRET_KEY": "x", "JWT_SECRET": "x", "DB_PASSWORD": "x"},
    )
    assert proc.returncode == 0, proc.stderr[-2000:]
    command = json.loads(proc.stdout)["services"]["mlflow"]["command"]

    assert command[:2] == ["sh", "-c"]
    # `config` prints a literal $ as $$ again; a single $ would have been interpolated (to nothing) by Compose.
    assert '"$$AWS_ENDPOINT_URL_S3"' in command[2] and '"$$D"' in command[2]


@TILT_REQUIRED
@pytest.mark.parametrize(
    "command",
    ["'server'", "[]", "['']", "['a', 3]", "['a\\nb']"],
)
def test_a_bad_command_stops_generation(tmp_path, command):
    body = LOAD + (
        "m = {{'appType': 'bring-your-own', 'stack': 'tube', 'port': 9000, 'image': 'nginx:alpine', 'container': {{'command': {}}}}}\n"
        "r = generate_backend_compose_entry('services/tube', 'tube', {{'name': 'bad'}}, m)\n"
    ).format(command)
    output = run_tilt(tmp_path, body)

    assert FAIL_MARKER in output and "'container.command' must be" in output, output[-2000:]
    assert RESULT_MARKER not in output


ENTRYPOINT_BODY = (
    "load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry', 'generate_app_compose_from_entries')\n"
    + """
app = {
    'appType': 'bring-your-own', 'stack': 'ml', 'port': 8080, 'image': 'nginx:alpine',
    'container': {'entrypoint': ['sh', '-c', 'exec "$$@"', '--'], 'command': ['nginx', '-g', 'daemon off;']},
}
bare = {'appType': 'bring-your-own', 'stack': 'ml', 'port': 8081, 'image': 'nginx:alpine', 'container': {'entrypoint': []}}
plain = {'appType': 'bring-your-own', 'stack': 'ml', 'port': 8082, 'image': 'nginx:alpine'}
entries = [
    generate_backend_compose_entry('services/ml', 'ml', {'name': 'app'}, app),
    generate_backend_compose_entry('services/ml', 'ml', {'name': 'bare'}, bare),
    generate_backend_compose_entry('services/ml', 'ml', {'name': 'plain'}, plain),
]
r = {'entries': entries, 'yaml': generate_app_compose_from_entries('services/ml', entries)}
"""
)


@TILT_REQUIRED
def test_entrypoint_is_written_as_a_compose_list(tmp_path):
    output = run_tilt(tmp_path, ENTRYPOINT_BODY)
    assert RESULT_MARKER in output, output[-3000:]
    entries = json.loads(output.split(RESULT_MARKER, 1)[1].strip())["entries"]

    assert '    entrypoint: [' in entries[0] and '"sh"' in entries[0]
    assert entries[0].index("entrypoint:") < entries[0].index("command:")
    assert "    entrypoint: []" in entries[1]
    assert "entrypoint:" not in entries[2] and "command:" not in entries[2]


@TILT_REQUIRED
@pytest.mark.skipif(shutil.which("docker") is None, reason="docker CLI not installed")
def test_compose_reads_entrypoint_and_keeps_the_escaped_dollar(tmp_path):
    output = run_tilt(tmp_path, ENTRYPOINT_BODY)
    assert RESULT_MARKER in output, output[-3000:]
    yaml_text = json.loads(output.split(RESULT_MARKER, 1)[1].strip())["yaml"]
    stack = tmp_path / "container-project" / "services" / "ml"
    (stack / ".autogenerated").mkdir(parents=True, exist_ok=True)
    for name in ("app", "bare", "plain"):
        (stack / name / ".autogenerated").mkdir(parents=True, exist_ok=True)
        (stack / name / ".autogenerated" / ".env.backend.autogenerated").write_text("")
    compose_file = stack / ".autogenerated" / "docker-compose.app.autogenerated.yml"
    compose_file.write_text(yaml_text)
    proc = subprocess.run(
        ["docker", "compose", "-p", "epproject", "-f", str(compose_file), "config", "--format", "json"],
        capture_output=True,
        text=True,
        timeout=60,
        env={**os.environ, "SERVER_SECRET_KEY": "x", "JWT_SECRET": "x", "DB_PASSWORD": "x"},
    )
    assert proc.returncode == 0, proc.stderr[-2000:]
    services = json.loads(proc.stdout)["services"]

    assert services["app"]["entrypoint"] == ["sh", "-c", 'exec "$$@"', "--"]
    assert services["app"]["command"] == ["nginx", "-g", "daemon off;"]
    assert services["plain"].get("entrypoint") is None
    assert services["bare"].get("entrypoint") == []


@TILT_REQUIRED
@pytest.mark.parametrize("entrypoint", ["'/entry.sh'", "['']", "['a', 3]", "['a\\nb']"])
def test_a_bad_entrypoint_stops_generation(tmp_path, entrypoint):
    body = LOAD + (
        "m = {{'appType': 'bring-your-own', 'stack': 'tube', 'port': 9000, 'image': 'nginx:alpine', 'container': {{'entrypoint': {}}}}}\n"
        "r = generate_backend_compose_entry('services/tube', 'tube', {{'name': 'bad'}}, m)\n"
    ).format(entrypoint)
    output = run_tilt(tmp_path, body)

    assert FAIL_MARKER in output and "'container.entrypoint' must be" in output, output[-2000:]
    assert RESULT_MARKER not in output
