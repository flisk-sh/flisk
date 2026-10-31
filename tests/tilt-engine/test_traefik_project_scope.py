# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Each Flisk project runs its own Traefik, and its Docker provider used to read every container on the machine, so it
loaded and health-checked the routed services of every other Flisk project (#2906). Every routed container now carries
`flisk.project=<project>`, and the generated Traefik reads only containers with its own project's value.

Executes the real Starlark through Tilt's interpreter (`tilt alpha tiltfile-result`).
"""

from __future__ import annotations

import pytest

from test_compose_project_scoping import TILT_REQUIRED, run_project

pytestmark = [pytest.mark.generator]

BODY = """
load('@DOCKER/compose/compose.star', 'generate_backend_compose_entry')
load('@DOCKER/networking/traefik.star', 'get_frontend_traefik_labels')
load('@DOCKER/compose/traefik_standalone.star', 'generate_standalone_traefik_compose')

manifest = {'appType': 'backend', 'stack': 'shop', 'port': 4001}
r = {
    'backend': generate_backend_compose_entry('services/shop', 'shop', {'name': 'orders', 'port': 4001}, manifest),
    'frontend': get_frontend_traefik_labels('storefront', 'shop', '/storefront', 5173),
    'traefik': generate_standalone_traefik_compose(),
}
"""


@TILT_REQUIRED
@pytest.mark.parametrize("project", ["shop", "team-app"])
def test_routed_containers_carry_their_project(tmp_path, project):
    result = run_project(tmp_path, project, BODY)
    for kind in ("backend", "frontend"):
        assert "traefik.enable=true" in result[kind]
        assert f'"flisk.project={project}"' in result[kind], result[kind]


@TILT_REQUIRED
@pytest.mark.parametrize("project", ["shop", "team-app"])
def test_traefik_reads_only_its_own_projects_containers(tmp_path, project):
    traefik = run_project(tmp_path, project, BODY)["traefik"]
    assert f'"--providers.docker.constraints=Label(`flisk.project`,`{project}`)"' in traefik, traefik
    # The constraint narrows the provider; it does not replace opt-in by traefik.enable.
    assert '"--providers.docker.exposedbydefault=false"' in traefik
