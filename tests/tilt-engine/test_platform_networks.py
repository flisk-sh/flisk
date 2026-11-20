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
load('@DOCKER/../../tilt/common/utils.star', 'platform_networks', 'fix_docker_networks', 'external_compose_networks')

r = {
    'base': platform_networks(),
    'infisical': platform_networks(infisical=True),
    'verdaccio': platform_networks(verdaccio=True),
    'both': platform_networks(True, True),
    'extra': platform_networks(extra_networks=['shop_traefik-private', 'shop_backend', 'shop_proxy']),
    'cmd_default': fix_docker_networks(),
    'cmd_subset': fix_docker_networks(platform_networks(infisical=True)),
    'cmd_extra': fix_docker_networks(platform_networks(extra_networks=['shop_traefik-private', 'shop_proxy'])),
}
"""

EXTERNAL_SCAN_BODY = """
load('@DOCKER/../../tilt/common/utils.star', 'external_compose_networks', 'platform_networks', 'fix_docker_networks')
load('@DOCKER/../../tilt/resources/infra-loader.star', 'collect_project_compose_files')

def _enable(name):
    return name in ['database-management', 'proxy']

compose_files = collect_project_compose_files(_enable, root_prefix='', app_resources=[
    {'name': 'orders', 'path': 'services/orders', 'compose_files': ['docker-compose.extra.yml']},
])
extra = external_compose_networks(compose_files)
networks = platform_networks(extra_networks=extra)
r = {
    'compose_files': compose_files,
    'extra': extra,
    'networks': networks,
    'cmd': fix_docker_networks(networks),
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


@TILT_REQUIRED
def test_platform_networks_appends_extra_networks_without_duplicates(tmp_path):
    r = run_project(tmp_path, "shop", NETWORKS_BODY)
    assert r["extra"] == [
        "shop_traefik-public",
        "shop_backend",
        "shop_database",
        "shop_traefik-private",
        "shop_proxy",
    ]
    assert r["cmd_extra"].count("docker network create") == 5
    assert "shop_traefik-private" in r["cmd_extra"]
    assert "shop_proxy" in r["cmd_extra"]


@TILT_REQUIRED
def test_init_networks_scans_external_project_networks_from_compose_files(tmp_path, monkeypatch):
    """#3992: keep #3779's 3-network default, but also create every <project>_* external network declared by loaded compose files."""
    monkeypatch.setenv("CUSTOM_PREFIX", "shop")
    project_root = tmp_path / "shop"
    (project_root / "services" / "platform" / "messaging").mkdir(parents=True)
    (project_root / "services" / "platform" / "messaging" / "docker-compose.yml").write_text(
        "services:\n"
        "  nats:\n"
        "    image: nats:2-alpine\n"
        "networks:\n"
        "  traefik-private:\n"
        "    name: shop_traefik-private\n"
        "    external: true\n"
        "  unrelated_external:\n"
        "    name: other_project_net\n"
        "    external: true\n"
        "  unsafe_name:\n"
        "    name: 'shop_bad;rm -rf /'\n"
        "    external: true\n"
        "  not_external:\n"
        "    name: shop_local_only\n"
        "    external: false\n"
    )
    for rel in [
        "shared-product-engineering/introvertic/infra/docker-compose.traefik.yml",
        "services/platform/proxy/docker-compose.core.yml",
        "services/platform/proxy/docker-compose.utilities.yml",
        "services/platform/proxy/docker-compose.redirects.yml",
        "services/platform/proxy/docker-compose.docs.yml",
    ]:
        p = project_root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        if rel.endswith("docker-compose.core.yml"):
            p.write_text(
                "services: {}\n"
                "networks:\n"
                "  proxy:\n"
                "    external:\n"
                "      name: ${CUSTOM_PREFIX}_proxy\n"
            )
        else:
            p.write_text("services: {}\n")
    (project_root / "services" / "orders").mkdir(parents=True)
    (project_root / "services" / "orders" / "docker-compose.extra.yml").write_text(
        "services: {}\n"
        "networks:\n"
        "  shop_custom:\n"
        "    external: true\n"
    )

    r = run_project(tmp_path, "shop", EXTERNAL_SCAN_BODY)
    assert r["extra"] == ["shop_custom", "shop_proxy", "shop_traefik-private"]
    assert r["networks"] == [
        "shop_traefik-public",
        "shop_backend",
        "shop_database",
        "shop_custom",
        "shop_proxy",
        "shop_traefik-private",
    ]
    assert "other_project_net" not in r["cmd"]
    assert "shop_local_only" not in r["cmd"]
    assert "shop_bad" not in r["cmd"]
    assert r["cmd"].count("docker network create") == 6


def test_infra_loader_wires_external_compose_network_scanning_and_nats_dep():
    """Static guard that runs even without Tilt installed: init-networks scans project compose files and nats waits for init-networks."""
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    infra = (root / "runtime" / "engine" / "topologies" / "tilt" / "resources" / "infra-loader.star").read_text()
    init_block = infra.split("def _init_networks", 1)[1].split("\n# =", 1)[0]
    assert "collect_project_compose_files(" in init_block
    assert "external_compose_networks(" in init_block
    assert "extra_networks=extra_networks" in init_block
    assert "cmd=fix_docker_networks_fn(networks)," in init_block
    assert "'FLISK_NETWORKS': ','.join(networks)" in init_block
    db_block = infra.split("def _load_database_management", 1)[1].split("\n# =", 1)[0]
    assert "dc_resource('nats', labels=['infra.messaging'], resource_deps=_proxy_deps(['init-networks'], golden_image_resource), auto_init=True)" in db_block


def test_external_compose_networks_starlark_logic_without_tilt():
    """Execute external_compose_networks from utils_docker_networks.star directly with a Starlark type shim."""
    import os
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    src = (root / "runtime" / "engine" / "topologies" / "tilt" / "common" / "utils_docker_networks.star").read_text()

    def _star_type(v):
        if isinstance(v, bool):
            return "bool"
        if isinstance(v, dict):
            return "dict"
        if isinstance(v, str):
            return "string"
        return type(v).__name__

    ns = {"type": _star_type, "os": os, "read_yaml": lambda _p, default=None: default}
    exec(compile(src, "utils_docker_networks.star", "exec"), ns)

    docs = {
        "messaging.yml": {
            "services": {"nats": {"image": "nats"}},
            "networks": {
                "traefik-private": {"name": "shop_traefik-private", "external": True},
                "other": {"name": "other_traefik-private", "external": True},
                "unsafe": {"name": "shop_bad;rm -rf /", "external": True},
                "local": {"name": "shop_local", "external": False},
            },
        },
        "proxy.yml": {
            "networks": {
                "proxy": {"external": {"name": "${PREFIX:-shop}_proxy"}},
                "shop_custom": {"external": True},
            },
        },
    }
    found = ns["external_compose_networks"](
        ["messaging.yml", "proxy.yml"],
        "shop_",
        env={},
        read_yaml_fn=lambda p, default=None: docs.get(p, default),
    )
    assert found == ["shop_custom", "shop_proxy", "shop_traefik-private"]
    cmd = ns["fix_docker_networks"](["shop_traefik-public", "shop_backend", "shop_database"] + found)
    assert cmd.count("docker network create") == 6
    assert "shop_traefik-private" in cmd and "shop_proxy" in cmd and "shop_custom" in cmd
