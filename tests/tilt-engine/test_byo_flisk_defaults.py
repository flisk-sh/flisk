# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Things Flisk did to a bring-your-own service that plain Compose does not (found running LycheeOrg/Lychee and nosia):

- #2991: `DATABASE_URL`, `TILT_DATABASE_URL`, `NODE_ENV=development` and `AUTO_MIGRATE` were injected into every container, so
  Laravel read Flisk's Postgres URL before its own `DB_CONNECTION=mysql`. Now only a service that asks for the shared database
  (dependsOn postgres / database-management / a `database` resource, or its own `databaseName`) gets them, and never over a
  `DATABASE_URL` of its own `env`.
- #2992: no hidden 512M / 0.5 CPU limit (an image that loads a model at start was OOM-killed). See test_byo_gpu_resources.py for
  the opt-in limits.
- #1519 / #2993: an uppercase `project.name` made Compose refuse the project name, and `services/platform/database-management/
  docker-compose.yml` kept the old name after a rename.

Runs the real generators through Tilt's interpreter (`tilt alpha tiltfile-result`), like test_byo_env.py, and checks with
`docker compose config` (when the Compose plugin is installed) what Compose sees.
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

LOAD = "load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry', 'generate_app_compose_from_entries')\n"

COMPOSE_BODY = LOAD + """
lychee = {
    'appType': 'bring-your-own', 'stack': 'photos', 'port': 8000, 'image': 'ghcr.io/lycheeorg/lychee:latest',
    'env': {'DB_CONNECTION': 'mysql', 'DB_HOST': 'mariadb'},
}
asks = {'appType': 'bring-your-own', 'stack': 'photos', 'port': 8001, 'image': 'example/app:1', 'dependsOn': ['postgres']}
asks_dm = {'appType': 'bring-your-own', 'stack': 'photos', 'port': 8002, 'image': 'example/app:1', 'dependsOn': ['database-management']}
asks_db = {'appType': 'bring-your-own', 'stack': 'photos', 'port': 8003, 'image': 'example/app:1', 'databaseName': 'photos_db'}
asks_flag = {'appType': 'bring-your-own', 'stack': 'photos', 'port': 8004, 'image': 'example/app:1', '_sharedDatabase': True}
computed_db = {
    'appType': 'bring-your-own', 'stack': 'photos', 'port': 8007, 'image': 'example/app:1', 'databaseName': 'flisk_photos',
    '_databaseNameComputed': True,
}
own_url = {
    'appType': 'bring-your-own', 'stack': 'photos', 'port': 8005, 'image': 'example/app:1', 'dependsOn': ['postgres'],
    'env': {'DATABASE_URL': 'mysql://root:secret@mariadb/lychee'},
}
nats = {'appType': 'bring-your-own', 'stack': 'photos', 'port': 8006, 'image': 'example/app:1', 'featuresEnabled': ['nats']}
backend = {'appType': 'backend', 'stack': 'photos', 'port': 4000}
entries = [
    generate_backend_compose_entry('services/photos', 'photos', {'name': 'lychee'}, lychee),
    generate_backend_compose_entry('services/photos', 'photos', {'name': 'own-url'}, own_url),
]
r = {
    'lychee': entries[0],
    'own_url': entries[1],
    'asks': generate_backend_compose_entry('services/photos', 'photos', {'name': 'asks'}, asks),
    'asks_dm': generate_backend_compose_entry('services/photos', 'photos', {'name': 'asks-dm'}, asks_dm),
    'asks_db': generate_backend_compose_entry('services/photos', 'photos', {'name': 'asks-db'}, asks_db),
    'computed_db': generate_backend_compose_entry('services/photos', 'photos', {'name': 'computed-db'}, computed_db),
    'asks_flag': generate_backend_compose_entry('services/photos', 'photos', {'name': 'asks-flag'}, asks_flag),
    'nats': generate_backend_compose_entry('services/photos', 'photos', {'name': 'nats'}, nats),
    'backend': generate_backend_compose_entry('services/photos', 'photos', {'name': 'api'}, backend),
    'yaml': generate_app_compose_from_entries('services/photos', entries),
    'project': PlatformDockerConstants_name,
}
"""

COMPOSE_BODY = COMPOSE_BODY.replace(
    LOAD, LOAD + "load('@ENGINE/topologies/platform/docker/constants.star', 'PROJECT_NAME', 'PROJECT_NAME_HYPHEN', 'infra_compose_project_name')\n", 1
).replace("'project': PlatformDockerConstants_name,", "'project': [PROJECT_NAME, PROJECT_NAME_HYPHEN, infra_compose_project_name('database-management')],")

DATABASE_LINES = ("DATABASE_URL=", "TILT_DATABASE_URL=", "NODE_ENV=development", "AUTO_MIGRATE=")


def run_tilt(project_root: Path, body: str, project_name: str = "photos") -> str:
    (project_root / ".flisk").mkdir(parents=True, exist_ok=True)
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": project_name}}))
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
    return tmp_path_factory.mktemp("defaults") / "Lychee"


@pytest.fixture(scope="module")
def result(project) -> dict:
    if shutil.which("tilt") is None:
        pytest.skip("tilt CLI not installed")
    output = run_tilt(project, COMPOSE_BODY, project_name="Lychee")
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@TILT_REQUIRED
def test_a_bring_your_own_service_gets_no_database_variables_it_did_not_ask_for(result):
    entry = result["lychee"]

    for line in DATABASE_LINES:
        assert line not in entry, line
    assert "TILT_NATS_URL" not in entry and "NATS_QUEUE_GROUP" not in entry
    # What it declares, and the documented PORT, are still there.
    assert '      - "DB_CONNECTION=mysql"\n' in entry
    assert "      - PORT=8000\n" in entry


@TILT_REQUIRED
def test_a_database_name_discovery_computed_is_not_a_request_for_the_shared_database(result):
    """Discovery gives every service a `databaseName` (#2991); only one the service wrote itself is a request."""
    entry = result["computed_db"]

    for line in DATABASE_LINES:
        assert line not in entry, line


@TILT_REQUIRED
@pytest.mark.parametrize("name", ["asks", "asks_dm", "asks_db", "asks_flag"])
def test_it_gets_the_shared_database_when_the_manifest_asks_for_it(result, name):
    entry = result[name]

    assert "      - TILT_DATABASE_URL=" in entry
    assert "      - DATABASE_URL=" in entry
    assert "      - NODE_ENV=development\n" in entry


@TILT_REQUIRED
def test_its_own_database_url_wins(result):
    entry = result["own_url"]

    assert "      - TILT_DATABASE_URL=" in entry
    assert entry.count("DATABASE_URL=") == 2  # TILT_DATABASE_URL and the service's own, never the injected one
    assert '      - "DATABASE_URL=mysql://root:secret@mariadb/lychee"\n' in entry


@TILT_REQUIRED
def test_nats_variables_only_with_the_nats_feature(result):
    assert "      - NATS_QUEUE_GROUP=photos_backend_svc\n" in result["nats"]
    assert "      - TILT_NATS_URL=" in result["nats"]


@TILT_REQUIRED
def test_a_service_flisk_builds_keeps_the_platform_environment(result):
    entry = result["backend"]

    for line in DATABASE_LINES:
        assert line in entry, line
    assert "      - TILT_NATS_URL=" in entry


@TILT_REQUIRED
@DOCKER_REQUIRED
def test_compose_sees_no_database_url_for_a_plain_service_and_the_services_own_for_the_other(result, project):
    stack = project / "services" / "photos"
    (stack / ".autogenerated").mkdir(parents=True, exist_ok=True)
    for name in ("lychee", "own-url"):
        (stack / name / ".autogenerated").mkdir(parents=True, exist_ok=True)
        (stack / name / ".autogenerated" / ".env.backend.autogenerated").write_text("")
    compose_file = stack / ".autogenerated" / "docker-compose.app.autogenerated.yml"
    compose_file.write_text(result["yaml"])
    proc = subprocess.run(
        ["docker", "compose", "-p", "lychee", "-f", str(compose_file), "config", "--format", "json"],
        capture_output=True,
        text=True,
        timeout=60,
        env={**os.environ, "JWT_SECRET": "x", "DB_PASSWORD": "x"},
    )
    assert proc.returncode == 0, proc.stderr[-2000:]
    services = json.loads(proc.stdout)["services"]

    assert "DATABASE_URL" not in services["lychee"]["environment"]
    assert services["own-url"]["environment"]["DATABASE_URL"] == "mysql://root:secret@mariadb/lychee"
    assert "deploy" not in services["lychee"]


@TILT_REQUIRED
def test_an_uppercase_project_name_is_used_lowercase(result):
    """#1519: Compose refuses `Lychee-database-management`; the engine now uses `lychee` everywhere."""
    assert result["project"] == ["lychee", "lychee", "lychee-database-management"]


STALE_COMPOSE = "name: Lychee_database\nservices: {}\n"

REGENERATE_BODY = """
load('@ENGINE/topologies/tilt/resources/infra-loader.star', 'Infra')
load('@ENGINE/topologies/tilt/common/utils.star', 'Utils')

def should_enable(name):
    return True

Infra.force_start_postgres(should_enable, '@ROOT/', None, Utils.write_file_if_changed)
r = {'ok': True}
"""


@TILT_REQUIRED
def test_the_platform_compose_follows_a_renamed_project(tmp_path):
    """#2993: the file written for `Lychee` kept `Lychee_database` after the rename, and Compose could not find that network."""
    root = tmp_path / "renamed"
    compose = root / "services" / "platform" / "database-management" / "docker-compose.yml"
    compose.parent.mkdir(parents=True)
    compose.write_text(STALE_COMPOSE)
    output = run_tilt(root, REGENERATE_BODY.replace("@ROOT", str(root)), project_name="Lychee")

    assert RESULT_MARKER in output, output[-3000:]
    text = compose.read_text()
    assert "Lychee" not in text
    assert "name: lychee_database\n" in text
    assert "container_name: lychee_postgres\n" in text
    assert "lychee_postgres_data:" in text
