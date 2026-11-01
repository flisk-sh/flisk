# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Compose options that imported stacks need on a bring-your-own resource:

- `image` with Compose variables (`postgres:${POSTGRES_VERSION:-18}-alpine`, any-sync-dockercompose's
  `ghcr.io/anyproto/any-sync-node:${ANY_SYNC_NODE_VERSION}`), written quoted so Compose fills it in from the project .env;
- `restart: on-failure:N`;
- `container.stopGracePeriod`, `container.extraHosts`, `container.ulimits`;
- `container.networkAliases`: extra DNS names on the backend network (karatektus/pl_mail's worker answers as `mercure`).

Runs the real Compose generator through Tilt's interpreter (`tilt alpha tiltfile-result`), like test_byo_container_options.py,
and checks with `docker compose config` (when Docker is installed) that Compose reads every value as written.
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
DOCKER_REQUIRED = pytest.mark.skipif(shutil.which("docker") is None, reason="docker CLI not installed")

REPO_ROOT = Path(__file__).resolve().parents[2]
ENGINE_ROOT = REPO_ROOT / "runtime" / "engine"
RESULT_MARKER = "Error in fail: RESULT"
FAIL_MARKER = "MANIFEST ERROR"

LOAD = (
    "load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry', 'generate_app_compose_from_entries')\n"
    "load('@ENGINE/topologies/tilt/manifest/parser.star', 'generated_string_error')\n"
)

COMPOSE_BODY = LOAD + """
db = {
    'appType': 'bring-your-own', 'stack': 'mail', 'port': 5432, 'image': 'postgres:${POSTGRES_VERSION:-18}-alpine',
    'restart': 'on-failure:5', 'exposeViaProxy': False,
    'container': {
        'stopGracePeriod': '1m30s',
        'extraHosts': ['host.docker.internal:host-gateway', 'legacy:10.0.0.5', 'v6:fd00::1'],
        'ulimits': {'nofile': {'soft': 65536, 'hard': 65536}, 'nproc': 65535, 'memlock': {'soft': -1, 'hard': -1}},
    },
}
worker = {
    'appType': 'bring-your-own', 'stack': 'mail', 'port': 3000, 'image': 'ghcr.io/anyproto/any-sync-node:${ANY_SYNC_NODE_VERSION}',
    'container': {'networkAliases': ['mercure', 'mercure.local']},
    'healthCheck': {'command': ['curl', '-f', 'http://localhost:3000/'], 'startPeriod': 45, 'interval': 10},
}
codecov = {
    'appType': 'bring-your-own', 'stack': 'mail', 'port': 8080, 'image': 'codecov/self-hosted:${CODECOV_TAG-latest}',
    'extraPorts': [{'port': 8080, 'publish': '${CODECOV_PORT-8080}'}],
}
plain = {'appType': 'bring-your-own', 'stack': 'mail', 'port': 9000, 'image': 'nginx:alpine', 'restart': 'always'}
backend = {'appType': 'backend', 'stack': 'mail', 'port': 4000, 'restart': 'on-failure:5'}
entries = [
    generate_backend_compose_entry('services/mail', 'mail', {'name': 'db'}, db),
    generate_backend_compose_entry('services/mail', 'mail', {'name': 'worker'}, worker),
    generate_backend_compose_entry('services/mail', 'mail', {'name': 'codecov'}, codecov),
]
r = {
    'db': entries[0],
    'worker': entries[1],
    'codecov': entries[2],
    'plain': generate_backend_compose_entry('services/mail', 'mail', {'name': 'plain'}, plain),
    'backend': generate_backend_compose_entry('services/mail', 'mail', {'name': 'api'}, backend),
    'yaml': generate_app_compose_from_entries('services/mail', entries),
    'parser': {
        'db': generated_string_error(db),
        'worker': generated_string_error(worker),
        'plain': generated_string_error(plain),
        'codecov': generated_string_error(codecov),
        'bad': [generated_string_error({'image': v}) for v in [
            'a${B', 'a${B:-}', 'a${B-}', 'a${B-x"}', 'a${1B}', 'a${B:-x"}', 'a${B:-x y}', 'a$B', 'a${B}}', 'x"y', 'a\\nprivileged: true', 'a{b}',
        ]],
    },
}
"""


def run_tilt(project_root: Path, body: str) -> str:
    (project_root / ".flisk").mkdir(parents=True, exist_ok=True)
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "opts-project"}}))
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
    return tmp_path_factory.mktemp("opts") / "opts-project"


@pytest.fixture(scope="module")
def result(project) -> dict:
    if shutil.which("tilt") is None:
        pytest.skip("tilt CLI not installed")
    output = run_tilt(project, COMPOSE_BODY)
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@TILT_REQUIRED
def test_an_image_with_variables_is_accepted_and_written_quoted(result):
    assert result["parser"]["db"] is None and result["parser"]["worker"] is None
    assert '    image: "postgres:${POSTGRES_VERSION:-18}-alpine"\n' in result["db"]
    assert '    image: "ghcr.io/anyproto/any-sync-node:${ANY_SYNC_NODE_VERSION}"\n' in result["worker"]
    # An image without a variable is written as before.
    assert "    image: nginx:alpine\n" in result["plain"]


@TILT_REQUIRED
def test_unset_only_defaults_are_accepted_in_image_and_publish(result):
    # codecov's "${CODECOV_PORT-8080}:8080": Compose uses the default only when the variable is unset.
    assert result["parser"]["codecov"] is None
    assert '    image: "codecov/self-hosted:${CODECOV_TAG-latest}"\n' in result["codecov"]
    assert '      - "${CODECOV_PORT-8080}:8080/tcp"\n' in result["codecov"]


@TILT_REQUIRED
def test_health_check_start_period(result):
    assert "      interval: 10s\n" in result["worker"]
    assert "      start_period: 45s\n" in result["worker"]


@TILT_REQUIRED
def test_an_image_variable_that_could_break_the_yaml_is_refused_before_generation(result):
    assert all(error and "'image'" in error for error in result["parser"]["bad"]), result["parser"]["bad"]


@TILT_REQUIRED
def test_restart_on_failure_with_a_count(result):
    assert "    restart: on-failure:5\n" in result["db"]
    assert "    restart: always\n" in result["plain"]
    # Only bring-your-own resources choose their restart policy.
    assert "on-failure:5" not in result["backend"]


@TILT_REQUIRED
def test_stop_grace_period_extra_hosts_and_ulimits(result):
    entry = result["db"]

    assert '    stop_grace_period: "1m30s"\n' in entry
    assert (
        "    extra_hosts:\n"
        '      - "host.docker.internal:host-gateway"\n'
        '      - "legacy:10.0.0.5"\n'
        '      - "v6:fd00::1"\n'
    ) in entry
    assert "    ulimits:\n" in entry
    assert "      nofile:\n        soft: 65536\n        hard: 65536\n" in entry
    assert "      nproc: 65535\n" in entry
    assert "      memlock:\n        soft: -1\n        hard: -1\n" in entry


@TILT_REQUIRED
def test_network_aliases_use_the_map_form_on_the_backend_network(result):
    entry = result["worker"]

    assert "_backend:\n        aliases:\n          - mercure\n          - mercure.local\n" in entry
    assert "_traefik-public: {}\n" in entry and "_database: {}\n" in entry
    # A service without aliases keeps the list form.
    assert "    networks:\n      - " in result["db"]


@TILT_REQUIRED
@DOCKER_REQUIRED
def test_compose_reads_every_value_and_fills_in_the_image_from_the_env(result, project):
    stack = project / "services" / "mail"
    (stack / ".autogenerated").mkdir(parents=True, exist_ok=True)
    for name in ("db", "worker", "codecov"):
        (stack / name / ".autogenerated").mkdir(parents=True, exist_ok=True)
        (stack / name / ".autogenerated" / ".env.backend.autogenerated").write_text("")
    compose_file = stack / ".autogenerated" / "docker-compose.app.autogenerated.yml"
    compose_file.write_text(result["yaml"])
    env = {
        k: v
        for k, v in os.environ.items()
        if k not in ("POSTGRES_VERSION", "ANY_SYNC_NODE_VERSION", "CODECOV_TAG", "CODECOV_PORT")
    }
    proc = subprocess.run(
        ["docker", "compose", "-p", "optsproject", "-f", str(compose_file), "config", "--format", "json"],
        capture_output=True,
        text=True,
        timeout=60,
        # CODECOV_PORT is set, so ${CODECOV_PORT-8080} takes it; CODECOV_TAG is unset, so ${CODECOV_TAG-latest} takes its default.
        env={**env, "ANY_SYNC_NODE_VERSION": "v0.9.1", "CODECOV_PORT": "9191", "JWT_SECRET": "x", "DB_PASSWORD": "x"},
    )
    assert proc.returncode == 0, proc.stderr[-2000:]
    services = json.loads(proc.stdout)["services"]
    db, worker = services["db"], services["worker"]

    assert db["image"] == "postgres:18-alpine"
    assert worker["image"] == "ghcr.io/anyproto/any-sync-node:v0.9.1"
    assert db["restart"] == "on-failure:5"
    assert db["stop_grace_period"] == "1m30s"
    # Compose 5.1 prints extra_hosts as name=address; older versions keep name:address.
    assert [h.replace("=", ":", 1) for h in db["extra_hosts"]] == ["host.docker.internal:host-gateway", "legacy:10.0.0.5", "v6:fd00::1"]
    assert db["ulimits"] == {"nofile": {"soft": 65536, "hard": 65536}, "nproc": 65535, "memlock": {"soft": -1, "hard": -1}}
    codecov = services["codecov"]
    assert codecov["image"] == "codecov/self-hosted:latest"
    assert [(p["published"], p["target"]) for p in codecov["ports"]] == [("9191", 8080)]
    assert worker["healthcheck"]["start_period"] == "45s"
    backend = next(name for name in worker["networks"] if name.endswith("_backend"))
    assert worker["networks"][backend]["aliases"] == ["mercure", "mercure.local"]


def fails(tmp_path: Path, manifest_extra: str, message: str) -> None:
    body = LOAD + (
        "m = {'appType': 'bring-your-own', 'stack': 'mail', 'port': 9000, 'image': 'nginx:alpine', " + manifest_extra + "}\n"
        "r = generate_backend_compose_entry('services/mail', 'mail', {'name': 'bad'}, m)\n"
    )
    output = run_tilt(tmp_path / "opts-project", body)

    assert FAIL_MARKER in output and message in output, output[-2000:]
    assert RESULT_MARKER not in output


@TILT_REQUIRED
@pytest.mark.parametrize(
    "extra, message",
    [
        ("'restart': 'on-failure:0'", "'restart' must be one of"),
        ("'healthCheck': {'startPeriod': 0}", "'healthCheck.startPeriod' must be a positive number"),
        ("'healthCheck': {'startPeriod': '30s'}", "'healthCheck.startPeriod' must be a positive number"),
        ("'extraPorts': [{'port': 80, 'publish': '${A-}'}]", "defaults must be a port or address:port"),
        ("'extraPorts': [{'port': 80, 'publish': '${A-80\\nprivileged: true}'}]", "defaults must be a port or address:port"),
        ("'restart': 'on-failure:101'", "'restart' must be one of"),
        ("'restart': 'on-failure:5\\nprivileged: true'", "'restart' must be one of"),
        ("'restart': 'sometimes'", "'restart' must be one of"),
        ("'container': {'stopGracePeriod': '30'}", "'container.stopGracePeriod'"),
        ("'container': {'stopGracePeriod': '30s\\nprivileged: true'}", "'container.stopGracePeriod'"),
        ("'container': {'stopGracePeriod': '1.s'}", "'container.stopGracePeriod'"),
        ("'container': {'stopGracePeriod': 30}", "'container.stopGracePeriod'"),
        ("'container': {'extraHosts': 'a:1.2.3.4'}", "'container.extraHosts' must be a list"),
        ("'container': {'extraHosts': ['a']}", "'container.extraHosts' entries"),
        ("'container': {'extraHosts': ['a:1.2.3.999']}", "'container.extraHosts' entries"),
        ("'container': {'extraHosts': ['a:1.2.3.4\\nprivileged: true']}", "'container.extraHosts' entries"),
        ("'container': {'extraHosts': ['a b:1.2.3.4']}", "'container.extraHosts' entries"),
        ("'container': {'extraHosts': ['a:\"x']}", "'container.extraHosts' entries"),
        ("'container': {'ulimits': ['nofile']}", "'container.ulimits' must be an object"),
        ("'container': {'ulimits': {'bogus': 1}}", "'container.ulimits' names must be one of"),
        ("'container': {'ulimits': {'nofile\\nprivileged': 1}}", "'container.ulimits' names must be one of"),
        ("'container': {'ulimits': {'nofile': '1'}}", "'container.ulimits.nofile' must be a number"),
        ("'container': {'ulimits': {'nofile': {'soft': 1}}}", "'container.ulimits.nofile' must be a number"),
        ("'container': {'ulimits': {'nofile': {'soft': 2, 'hard': 1}}}", "'container.ulimits.nofile' soft must not be above hard"),
        ("'container': {'ulimits': {'nofile': -2}}", "'container.ulimits.nofile' must be a number"),
        ("'container': {'networkAliases': 'mercure'}", "'container.networkAliases' must be a list"),
        ("'container': {'networkAliases': ['-mercure']}", "'container.networkAliases' entries"),
        ("'container': {'networkAliases': ['mercure\\n  privileged: true']}", "'container.networkAliases' entries"),
        ("'container': {'networkAliases': ['a', 'a']}", "'container.networkAliases' lists a name twice"),
        ("'sidecarOf': 'app', 'container': {'networkAliases': ['mercure']}", "'container.networkAliases' does not apply to a sidecar"),
    ],
)
def test_a_value_that_could_add_yaml_keys_stops_generation(tmp_path, extra, message):
    fails(tmp_path, extra, message)
