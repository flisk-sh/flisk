# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Every Docker network takes a /16 from Docker's default address pools (about 32 in total), so a project
creates only the networks it attaches containers to (#3767): traefik-public, backend and database, plus the
infisical and verdaccio networks only when those features are on. Nothing attaches to the old
`traefik-private` and `proxy` networks, so they are no longer created.

Runs the real Starlark through Tilt's interpreter (`tilt alpha tiltfile-result`).
"""

from __future__ import annotations

import pytest

from test_compose_project_scoping import TILT_REQUIRED, run_project

pytestmark = [pytest.mark.generator]

NETWORKS_BODY = """
load('@DOCKER/../../tilt/common/utils.star', 'platform_networks', 'fix_docker_networks')

r = {
    'base': platform_networks(),
    'infisical': platform_networks(infisical=True),
    'verdaccio': platform_networks(verdaccio=True),
    'both': platform_networks(True, True),
    'cmd_default': fix_docker_networks(),
    'cmd_subset': fix_docker_networks(platform_networks(infisical=True)),
}
"""

COMPOSE_BODY = """
load('@DOCKER/compose/compose.star', 'generate_backend_compose_entry', 'generate_app_compose_from_entries', 'generate_migrator_compose')

res = {'name': 'api', 'port': 4001}
manifest = {'appType': 'backend', 'stack': 'shop', 'port': 4001}
entry = generate_backend_compose_entry('services/shop', 'api', res, manifest)
r = {
    'app': generate_app_compose_from_entries('services/shop', [entry]),
    'migrator': generate_migrator_compose('services/shop', 'api', 'services/shop/Dockerfile'),
}
"""


@TILT_REQUIRED
def test_a_small_project_creates_three_networks(tmp_path):
    r = run_project(tmp_path, "shop", NETWORKS_BODY)
    assert r["base"] == ["shop_traefik-public", "shop_backend", "shop_database"]
    assert len(r["base"]) <= 4
    joined = " ".join(r["base"])
    assert "traefik-private" not in joined and "_proxy" not in joined
    assert "infisical" not in joined and "verdaccio" not in joined


@TILT_REQUIRED
def test_optional_networks_are_created_only_for_their_feature(tmp_path):
    r = run_project(tmp_path, "shop", NETWORKS_BODY)
    assert r["infisical"] == r["base"] + ["shop_infisical-network"]
    assert r["verdaccio"] == r["base"] + ["shop_verdaccio-network"]
    assert r["both"] == r["base"] + ["shop_infisical-network", "shop_verdaccio-network"]


@TILT_REQUIRED
def test_init_networks_command_creates_only_the_given_networks(tmp_path):
    r = run_project(tmp_path, "shop", NETWORKS_BODY)
    assert r["cmd_default"].count("docker network create") == 3
    assert r["cmd_subset"].count("docker network create") == 4
    assert "infisical-network" not in r["cmd_default"]
    assert "shop_infisical-network" in r["cmd_subset"]


@TILT_REQUIRED
def test_app_compose_does_not_join_the_infisical_network_by_default(tmp_path, monkeypatch):
    monkeypatch.delenv("INFISICAL_ENABLED", raising=False)
    r = run_project(tmp_path, "shop", COMPOSE_BODY)
    assert "infisical-network" not in r["app"]
    assert "infisical-network" not in r["migrator"]
    assert "shop_database" in r["app"] and "shop_backend" in r["migrator"]


@TILT_REQUIRED
def test_app_compose_joins_the_infisical_network_when_infisical_is_on(tmp_path, monkeypatch):
    monkeypatch.setenv("INFISICAL_ENABLED", "true")
    r = run_project(tmp_path, "shop", COMPOSE_BODY)
    assert "shop_infisical-network" in r["app"]
    assert "shop_infisical-network" in r["migrator"]
