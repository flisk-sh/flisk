# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Compose variables that open-mercato and anyproto/any-sync-dockercompose put where Flisk wanted a literal:

- `container.extraHosts` addresses: `host.docker.internal:${OM_HOST_GATEWAY:-host-gateway}` (also `${X}`, `${X-d}`);
- bind `volumes[].source` with no default or with a sub-path: `${STORAGE_DIR}/redis`, `${STORAGE_DIR}`, `${DATA:-./data}/sub`;
- `extraPorts[].publish` with no default: `127.0.0.1:${REDIS_PORT}` (the container side stays the literal `port`).

Runs the real generator through Tilt's interpreter (`tilt alpha tiltfile-result`) and checks with `docker compose config` (when
Docker is installed) that Compose resolves each value from the environment.
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


def _compose_plugin_missing() -> bool:
    if shutil.which("docker") is None:
        return True
    return subprocess.run(["docker", "compose", "version"], capture_output=True).returncode != 0


DOCKER_REQUIRED = pytest.mark.skipif(_compose_plugin_missing(), reason="docker compose plugin not installed")

REPO_ROOT = Path(__file__).resolve().parents[2]
ENGINE_ROOT = REPO_ROOT / "runtime" / "engine"
RESULT_MARKER = "Error in fail: RESULT"
FAIL_MARKER = "MANIFEST ERROR"

LOAD = "load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry', 'generate_app_compose_from_entries')\n"

COMPOSE_BODY = LOAD + """
redis = {
    'appType': 'bring-your-own', 'stack': 'sync', 'port': 6379, 'image': 'redis:7', 'exposeViaProxy': False,
    'extraPorts': [
        {'port': 6379, 'publish': '127.0.0.1:${REDIS_PORT}'},
        {'port': 6380, 'publish': '${REDIS_TLS_PORT}'},
        {'port': 6381, 'publish': '${BIND_HOST}:6381'},
    ],
    'volumes': [
        {'source': '${STORAGE_DIR}/redis', 'target': '/data', 'selinux': 'Z'},
        {'source': '${STORAGE_DIR}', 'target': '/storage', 'readOnly': True},
        {'source': '${DATA:-./data}/sub', 'target': '/sub'},
    ],
    'container': {'extraHosts': ['host.docker.internal:${OM_HOST_GATEWAY:-host-gateway}', 'db:${DB_HOST}', 'cache:${CACHE_HOST-10.0.0.5}']},
}
entries = [generate_backend_compose_entry('services/sync', 'sync', {'name': 'redis'}, redis)]
r = {'redis': entries[0], 'yaml': generate_app_compose_from_entries('services/sync', entries)}
"""


def run_tilt(project_root: Path, body: str) -> str:
    (project_root / ".flisk").mkdir(parents=True, exist_ok=True)
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "round4-project"}}))
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
def project(tmp_path_factory) -> Path:
    return tmp_path_factory.mktemp("round4") / "round4-project"


@pytest.fixture(scope="module")
def result(project) -> dict:
    if shutil.which("tilt") is None:
        pytest.skip("tilt CLI not installed")
    output = run_tilt(project, COMPOSE_BODY)
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@TILT_REQUIRED
def test_extra_hosts_with_variable_addresses(result):
    entry = result["redis"]

    assert '      - "host.docker.internal:${OM_HOST_GATEWAY:-host-gateway}"\n' in entry
    assert '      - "db:${DB_HOST}"\n' in entry
    assert '      - "cache:${CACHE_HOST-10.0.0.5}"\n' in entry


@TILT_REQUIRED
def test_bind_sources_without_a_default_or_with_a_sub_path(result):
    entry = result["redis"]

    # A bare variable is required: Compose stops when it is unset or empty instead of mounting "/redis".
    assert '      - "${STORAGE_DIR:?STORAGE_DIR is not set, add an absolute path to .env}/redis:/data:Z"\n' in entry
    assert '      - "${STORAGE_DIR:?STORAGE_DIR is not set, add an absolute path to .env}:/storage:ro"\n' in entry
    assert '      - "${DATA:-../../../services/sync/redis/data}/sub:/sub"\n' in entry


@TILT_REQUIRED
def test_publish_without_a_default(result):
    entry = result["redis"]

    # A bare variable is required, so an unset one cannot turn "${PORT}80" into host port 80 on every interface.
    assert '      - "127.0.0.1:${REDIS_PORT:?REDIS_PORT is not set, add it to .env}:6379/tcp"\n' in entry
    assert '      - "${REDIS_TLS_PORT:?REDIS_TLS_PORT is not set, add it to .env}:6380/tcp"\n' in entry
    assert '      - "${BIND_HOST:?BIND_HOST is not set, add it to .env}:6381:6381/tcp"\n' in entry


GOOD_ENV = {
    "DB_HOST": "10.1.2.3",
    "STORAGE_DIR": "/srv/any-sync",
    "REDIS_PORT": "16379",
    "REDIS_TLS_PORT": "16380",
    "BIND_HOST": "127.0.0.1",
}
VARIABLES = ("OM_HOST_GATEWAY", "DB_HOST", "CACHE_HOST", "STORAGE_DIR", "DATA", "REDIS_PORT", "REDIS_TLS_PORT", "BIND_HOST")


def write_compose(result: dict, project: Path) -> Path:
    stack = project / "services" / "sync"
    (stack / ".autogenerated").mkdir(parents=True, exist_ok=True)
    (stack / "redis" / ".autogenerated").mkdir(parents=True, exist_ok=True)
    (stack / "redis" / ".autogenerated" / ".env.backend.autogenerated").write_text("")
    compose_file = stack / ".autogenerated" / "docker-compose.app.autogenerated.yml"
    compose_file.write_text(result["yaml"])
    return compose_file


def compose_config(compose_file: Path, variables: dict) -> subprocess.CompletedProcess:
    env = {k: v for k, v in os.environ.items() if k not in VARIABLES}
    return subprocess.run(
        ["docker", "compose", "-p", "round4project", "-f", str(compose_file), "config", "--format", "json"],
        capture_output=True,
        text=True,
        timeout=60,
        env={**env, "JWT_SECRET": "x", "DB_PASSWORD": "x", **variables},
    )


@TILT_REQUIRED
@DOCKER_REQUIRED
def test_compose_resolves_the_values_from_the_environment(result, project):
    compose_file = write_compose(result, project)
    proc = compose_config(compose_file, GOOD_ENV)
    assert proc.returncode == 0, proc.stderr[-2000:]
    redis = json.loads(proc.stdout)["services"]["redis"]

    hosts = sorted(h.replace("=", ":", 1) for h in redis["extra_hosts"])
    assert hosts == ["cache:10.0.0.5", "db:10.1.2.3", "host.docker.internal:host-gateway"]
    volumes = {v["target"]: v for v in redis["volumes"]}
    assert volumes["/data"]["source"] == "/srv/any-sync/redis"
    assert volumes["/data"]["bind"]["selinux"] == "Z"
    assert volumes["/storage"]["source"] == "/srv/any-sync" and volumes["/storage"]["read_only"] is True
    assert volumes["/sub"]["source"] == str(project / "services" / "sync" / "redis" / "data" / "sub")
    ports = sorted((p["host_ip"] if "host_ip" in p else "", p["published"], p["target"]) for p in redis["ports"])
    assert ports == [("", "16380", 6380), ("127.0.0.1", "16379", 6379), ("127.0.0.1", "6381", 6381)]


@TILT_REQUIRED
@DOCKER_REQUIRED
@pytest.mark.parametrize(
    "unset, message",
    [
        ("STORAGE_DIR", "STORAGE_DIR is not set, add an absolute path to .env"),
        ("REDIS_PORT", "REDIS_PORT is not set, add it to .env"),
        ("REDIS_TLS_PORT", "REDIS_TLS_PORT is not set, add it to .env"),
        ("BIND_HOST", "BIND_HOST is not set, add it to .env"),
    ],
)
def test_compose_stops_when_a_required_variable_is_unset_or_empty(result, project, unset, message):
    compose_file = write_compose(result, project)
    for value in (None, ""):
        env = {**GOOD_ENV}
        if value is None:
            del env[unset]
        else:
            env[unset] = value
        proc = compose_config(compose_file, env)

        assert proc.returncode != 0, f"{unset}={value!r} was accepted"
        assert message in proc.stderr, proc.stderr[-1500:]


def fails(tmp_path: Path, manifest_extra: str, message: str) -> None:
    body = LOAD + (
        "m = {'appType': 'bring-your-own', 'stack': 'sync', 'port': 9000, 'image': 'nginx:alpine', " + manifest_extra + "}\n"
        "r = generate_backend_compose_entry('services/sync', 'sync', {'name': 'bad'}, m)\n"
    )
    output = run_tilt(tmp_path / "round4-project", body)

    assert FAIL_MARKER in output and message in output, output[-2000:]
    assert RESULT_MARKER not in output


@TILT_REQUIRED
@pytest.mark.parametrize(
    "extra, message",
    [
        ("'container': {'extraHosts': ['db:${DB_HOST:-localhost}']}", "'container.extraHosts' entries"),
        ("'container': {'extraHosts': ['db:${DB_HOST:-\"}']}", "'container.extraHosts' entries"),
        ("'container': {'extraHosts': ['db:${1A}']}", "'container.extraHosts' entries"),
        ("'container': {'extraHosts': ['db:${A}x']}", "'container.extraHosts' entries"),
        ("'container': {'extraHosts': ['db:${A:-1.2.3.4\\nprivileged: true}']}", "'container.extraHosts' entries"),
        ("'volumes': [{'source': '${A}/../etc', 'target': '/x'}]", "'volumes[0].source' variables must be"),
        ("'volumes': [{'source': '${A}/x y', 'target': '/x'}]", "'volumes[0].source' variables must be"),
        ("'volumes': [{'source': '${A}/x\\nprivileged: true', 'target': '/x'}]", "'volumes[0].source' variables must be"),
        ("'volumes': [{'source': '${A:-./x}/../..', 'target': '/x'}]", "'volumes[0].source' variables must be"),
        ("'extraPorts': [{'port': 80, 'publish': '${A}x'}]", "accepts digits"),
        ("'extraPorts': [{'port': 80, 'publish': '${A}:80\\nprivileged: true'}]", "accepts digits"),
        ("'extraPorts': [{'port': 80, 'publish': '${A'}]", "without a closing"),
        ("'extraPorts': [{'port': 80, 'publish': '${PORT}', 'protocol': 'sctp'}]", "'extraPorts[0].protocol' must be tcp or udp"),
        ("'extraPorts': [{'port': 80, 'publish': '127.0.0.1:65536${A}'}]", "has a host port above 65535"),
        ("'extraPorts': [{'port': 80, 'publish': '${A}65536'}]", "has a host port above 65535"),
        ("'extraPorts': [{'port': 80, 'publish': '${A}:'}]", "must give a port or address:port"),
        ("'extraPorts': [{'port': 80, 'publish': '${HOST}:80'}, {'port': 8080, 'hostPort': 80}]", "80/tcp is published twice"),
        ("'extraPorts': [{'port': 80, 'publish': '${HOST}:80'}, {'port': 81, 'publish': '${OTHER}:80'}]", "80/tcp is published twice"),
        ("'container': {'extraHosts': ['db:${A:-:}']}", "'container.extraHosts' entries"),
        ("'container': {'extraHosts': ['db::']}", "'container.extraHosts' entries"),
        ("'extraPorts': [{'port': 80, 'publish': '${1A}'}]", "variable names must be letters"),
    ],
)
def test_a_value_that_could_add_yaml_keys_stops_generation(tmp_path, extra, message):
    fails(tmp_path, extra, message)
