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
DOCKER_REQUIRED = pytest.mark.skipif(shutil.which("docker") is None, reason="docker CLI not installed")
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
proxy = {
    'appType': 'bring-your-own', 'stack': 'tube', 'port': 8080, 'image': 'caddy:2',
    'extraPorts': [
        {'port': 80, 'publish': '${TUBEHAUS_HTTP_BIND:-0.0.0.0:80}'},
        {'port': 443, 'publish': '${TUBEHAUS_HTTPS_PORT:-443}'},
        {'port': 443, 'protocol': 'udp', 'publish': '127.0.0.1:${TUBEHAUS_HTTPS_PORT:-443}'},
    ],
}
lan = {'appType': 'bring-your-own', 'stack': 'tube', 'port': 8080, 'image': 'caddy:2', 'extraPorts': [{'port': 80, 'bind': '0.0.0.0'}, {'port': 443, 'bind': '127.0.0.1'}]}
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
    'lan': generate_backend_compose_entry('services/tube', 'tube', {'name': 'lan'}, lan),
    'proxy': generate_backend_compose_entry('services/tube', 'tube', {'name': 'proxy'}, proxy),
    'proxy_yaml': generate_app_compose_from_entries('services/tube', [generate_backend_compose_entry('services/tube', 'tube', {'name': 'proxy'}, proxy)]),
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
def test_bind_opens_a_port_to_the_network_only_when_asked(result):
    entry = result["lan"]

    assert '      - "0.0.0.0:80:80/tcp"\n' in entry
    assert '      - "127.0.0.1:443:443/tcp"\n' in entry


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
        ("'extraPorts': [{'port': 80, 'bind': '192.168.1.5'}]", "'extraPorts[0].bind' must be 127.0.0.1 or 0.0.0.0"),
        ("'extraPorts': [{'port': 80, 'publish': '${A:-80}', 'hostPort': 81}]", "'extraPorts[0].publish' replaces hostPort and bind"),
        ("'extraPorts': [{'port': 80, 'publish': '${A}'}]", "needs a default for every variable"),
        ("'extraPorts': [{'port': 80, 'publish': '${A:-}'}]", "defaults must be a port or address:port"),
        ("'extraPorts': [{'port': 80, 'publish': '${1A:-80}'}]", "variable names must be letters"),
        ("'extraPorts': [{'port': 80, 'publish': '${A:-80'}]", "needs a default for every variable"),
        ("'extraPorts': [{'port': 80, 'publish': 80}]", "must be a string such as"),
        ("'extraPorts': [{'port': 80, 'publish': ''}]", "must be a string such as"),
        ("'extraPorts': [{'port': 80, 'publish': '0.0.0.0:80\\nprivileged: true'}]", "accepts digits"),
        ("'extraPorts': [{'port': 80, 'publish': '0.0.0.0:80\\\\\"'}]", "accepts digits"),
        ("'extraPorts': [{'port': 80, 'publish': '${A:-80}\\nx'}]", "defaults must be a port or address:port"),
        ("'extraPorts': [{'port': 80, 'publish': '${A:-80\\n}'}]", "defaults must be a port or address:port"),
        ("'extraPorts': [{'port': 80, 'publish': '[::1]:80'}]", "accepts digits"),
        ("'extraPorts': [{'port': 80, 'publish': '${A:-localhost:80}'}]", "defaults must be a port or address:port"),
        ("'extraPorts': [{'port': 80, 'publish': '${A:-1.2.3:80}'}]", "must give a port or address:port"),
        ("'extraPorts': [{'port': 80, 'publish': '${A:-300.0.0.1:80}'}]", "must give a port or address:port"),
        ("'extraPorts': [{'port': 80, 'publish': '${A:-0}'}]", "must give a port or address:port"),
        ("'extraPorts': [{'port': 80, 'publish': '${A:-65536}'}]", "must give a port or address:port"),
        ("'extraPorts': [{'port': 80, 'publish': '${A:-1:2:3}'}]", "must give a port or address:port"),
        ("'extraPorts': [{'port': 80, 'publish': '${A:-80}'}, {'port': 81, 'publish': '80'}]", "is published twice"),
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


@TILT_REQUIRED
def test_publish_is_the_compose_host_side_with_its_default_in_the_file(result):
    entry = result["proxy"]

    assert (
        "    ports:\n"
        '      - "${TUBEHAUS_HTTP_BIND:-0.0.0.0:80}:80/tcp"\n'
        '      - "${TUBEHAUS_HTTPS_PORT:-443}:443/tcp"\n'
        '      - "127.0.0.1:${TUBEHAUS_HTTPS_PORT:-443}:443/udp"\n'
    ) in entry


@TILT_REQUIRED
@DOCKER_REQUIRED
@pytest.mark.parametrize(
    "dotenv, published",
    [
        ("", [("0.0.0.0", 80, 80), ("0.0.0.0", 443, 443), ("127.0.0.1", 443, 443)]),
        ("TUBEHAUS_HTTP_BIND=127.0.0.1:8080\n", [("127.0.0.1", 8080, 80), ("0.0.0.0", 443, 443), ("127.0.0.1", 443, 443)]),
        ("TUBEHAUS_HTTP_BIND=8081\nTUBEHAUS_HTTPS_PORT=8443\n", [("0.0.0.0", 8081, 80), ("0.0.0.0", 8443, 443), ("127.0.0.1", 8443, 443)]),
    ],
    ids=["default", "bind-and-port-override", "port-only-override"],
)
def test_compose_resolves_the_default_and_a_dotenv_override(result, tmp_path, dotenv, published):
    # Like the project: the stack file sits in services/<stack>/.autogenerated and `flisk up` passes the root .env as --env-file.
    stack = tmp_path / "services" / "tube"
    (stack / ".autogenerated").mkdir(parents=True)
    compose_file = stack / ".autogenerated" / "docker-compose.app.autogenerated.yml"
    compose_file.write_text(result["proxy_yaml"])
    (stack / "proxy" / ".autogenerated").mkdir(parents=True)
    (stack / "proxy" / ".autogenerated" / ".env.backend.autogenerated").write_text("")
    command = ["docker", "compose", "-p", "ports", "-f", str(compose_file)]
    if dotenv:
        (tmp_path / ".env").write_text(dotenv)
        command += ["--env-file", str(tmp_path / ".env")]
    env = {k: v for k, v in os.environ.items() if not k.startswith("TUBEHAUS_")}
    proc = subprocess.run(
        command + ["config", "--format", "json"],
        capture_output=True,
        text=True,
        timeout=60,
        env={**env, "SERVER_SECRET_KEY": "x", "JWT_SECRET": "x", "DB_PASSWORD": "x"},
    )
    assert proc.returncode == 0, proc.stderr[-2000:]
    ports = json.loads(proc.stdout)["services"]["proxy"]["ports"]

    assert [(p.get("host_ip", "0.0.0.0"), int(p["published"]), p["target"]) for p in ports] == published
