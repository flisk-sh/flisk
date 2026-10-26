# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Traefik router, middleware and service names carry the Flisk project name.

One Traefik instance serves every Flisk project on a machine and keys routers, middlewares and services by name alone.
Before the names were scoped, two projects that both had an `api` service defined the same `api-project` router with
different rules, and Traefik dropped both (`HTTP router defined multiple times with different configurations`).

Runs the real generators through Tilt's interpreter (`tilt alpha tiltfile-result`).
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = [pytest.mark.generator]
TILT_REQUIRED = pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")

REPO_ROOT = Path(__file__).resolve().parents[2]
NETWORKING_DIR = REPO_ROOT / "runtime" / "engine" / "topologies" / "platform" / "docker" / "networking"
RESULT_MARKER = "Error in fail: RESULT"

# Both projects declare a backend named `api` and a frontend named `api`, the case from two projects running at once.
LABELS_BODY = """
load('@NETWORKING/traefik.star', 'get_backend_traefik_labels', 'get_frontend_traefik_labels')

manifest = {'appType': 'backend', 'stack': 'api', 'port': 4000}
r = {
    'backend': get_backend_traefik_labels('api', 'api.backend.local', '', 'api', 4000, '/health', manifest=manifest),
    'frontend': get_frontend_traefik_labels('api', 'api', '/app', 3000, manifest=manifest),
}
"""

NAME_PATTERN = re.compile(r"traefik\.http\.(?:routers|middlewares|services)\.([A-Za-z0-9_-]+)\.")


def run_project(tmp_path: Path, project_name: str, body: str) -> dict:
    """Evaluate `body` as one Flisk project named `project_name`; the body must assign a dict to `r`."""
    project_root = tmp_path / project_name
    (project_root / ".flisk").mkdir(parents=True)
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": project_name}}))
    tiltfile = project_root / "Tiltfile"
    tiltfile.write_text(body.replace("@NETWORKING", str(NETWORKING_DIR)) + "\nfail('RESULT' + encode_json(r))\n")
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


def defined_names(labels: str) -> set[str]:
    return set(NAME_PATTERN.findall(labels))


@TILT_REQUIRED
def test_two_projects_with_the_same_service_name_define_disjoint_traefik_names(tmp_path):
    first = run_project(tmp_path, "app-demo", LABELS_BODY)
    second = run_project(tmp_path, "proj2", LABELS_BODY)

    for kind in ("backend", "frontend"):
        first_names = defined_names(first[kind])
        second_names = defined_names(second[kind])
        assert first_names, kind
        assert first_names.isdisjoint(second_names), (kind, first_names & second_names)


@TILT_REQUIRED
def test_traefik_names_are_prefixed_with_their_project(tmp_path):
    first = run_project(tmp_path, "app-demo", LABELS_BODY)

    for kind in ("backend", "frontend"):
        for name in defined_names(first[kind]):
            assert name.startswith("app_00002ddemo-"), (kind, name)
    # The project router is the one reported as colliding in the bug; its name and middleware must match each other.
    assert "traefik.http.routers.app_00002ddemo-api-project.middlewares=app_00002ddemo-api-strip-prefix-project" in first["backend"]
    assert "traefik.http.middlewares.app_00002ddemo-api-strip-prefix-project.stripprefix.prefixes=/api/api" in first["backend"]


@TILT_REQUIRED
def test_routing_rules_still_follow_the_project_host(tmp_path):
    first = run_project(tmp_path, "app-demo", LABELS_BODY)
    second = run_project(tmp_path, "proj2", LABELS_BODY)

    assert "traefik.http.routers.app_00002ddemo-api-project.rule=Host(`api.app-demo.localhost`)" in first["backend"]
    assert "traefik.http.routers.proj2-api-project.rule=Host(`api.proj2.localhost`)" in second["backend"]


RESOURCE_BODY = """
load('@NETWORKING/traefik.star', 'get_backend_traefik_labels')

manifest = {'appType': 'backend', 'stack': 'api', 'port': 4000}
r = {'backend': get_backend_traefik_labels(RESOURCE, 'api.backend.local', '', RESOURCE, 4000, '/health', manifest=manifest)}
"""


@TILT_REQUIRED
def test_project_and_resource_pairs_that_join_to_the_same_text_stay_distinct(tmp_path):
    """`team` + `app-api` and `team-app` + `api` both used to join to `team-app-api`, so their routers collided."""
    first = run_project(tmp_path, "team", RESOURCE_BODY.replace("RESOURCE", "'app-api'"))
    second = run_project(tmp_path, "team-app", RESOURCE_BODY.replace("RESOURCE", "'api'"))

    assert defined_names(first["backend"]).isdisjoint(defined_names(second["backend"]))
