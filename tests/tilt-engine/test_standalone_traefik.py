# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
"""Standalone TDK projects must serve api.{project}.localhost via Traefik."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = [pytest.mark.fast, pytest.mark.generator]

REPO_ROOT = Path(__file__).resolve().parents[2]
COMPOSE_DIR = REPO_ROOT / "engine" / "topologies" / "platform" / "docker" / "compose"
RESULT_MARKER = "Error in fail: RESULT"


def _run_starlark(tmp_path: Path, body: str) -> dict:
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(body.replace("@COMPOSE", str(COMPOSE_DIR)) + "\nfail('RESULT' + encode_json(r))\n")
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=180,
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


def test_standalone_traefik_compose_generator_exists():
    source = (
        REPO_ROOT
        / "engine"
        / "topologies"
        / "platform"
        / "docker"
        / "compose"
        / "traefik_standalone.star"
    ).read_text()
    assert "generate_standalone_traefik_compose" in source
    assert "entrypoints.web.address=:80" in source


def test_infra_loader_falls_back_to_standalone_traefik():
    source = (
        REPO_ROOT
        / "engine"
        / "topologies"
        / "tilt"
        / "resources"
        / "infra-loader.star"
    ).read_text()
    assert "_load_standalone_traefik" in source
    assert "using standalone Traefik" in source


def test_project_router_uses_cli_api_path():
    source = (
        REPO_ROOT
        / "engine"
        / "topologies"
        / "platform"
        / "docker"
        / "networking"
        / "traefik_helpers.star"
    ).read_text()
    assert "def cli_api_path(" in source
    assert "tdk up" in source


def test_tiltfile_keeps_traefik_in_focus_mode():
    source = (REPO_ROOT / "cli" / "templates" / "Tiltfile.hbs").read_text()
    assert "'traefik'" in source
    assert "init-networks" in source


def _infra_loader_source() -> str:
    return (
        REPO_ROOT
        / "engine"
        / "topologies"
        / "tilt"
        / "resources"
        / "infra-loader.star"
    ).read_text()


def test_standalone_traefik_uses_selected_ports_without_stopping_other_projects():
    """Traefik must use selected ingress ports without stopping a different project's proxy."""
    source = _infra_loader_source()
    assert "_stop_conflicting_traefik" not in source
    assert "os.environ.get('TDK_HTTP_PORT', '8080')" in source
    assert "os.environ.get('TDK_HTTPS_PORT', '8443')" in source
    assert "docker stop" not in source


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_standalone_compose_enables_file_provider_and_wake_gateway(tmp_path):
    """openspec/changes/prioritized-cold-start (D4): a `sablier.deferStart`
    resource's static route needs Traefik's file provider enabled and a wake
    gateway running, even in a landscape with no such resource yet (harmless:
    an empty dynamic directory yields zero extra routes)."""
    r = _run_starlark(
        tmp_path,
        "load('@COMPOSE/traefik_standalone.star', 'generate_standalone_traefik_compose')\n"
        "r = {'yaml': generate_standalone_traefik_compose(True)}\n",
    )
    yaml_text = r["yaml"]
    assert "--providers.file.directory=/etc/traefik/dynamic" in yaml_text
    assert "--providers.file.watch=true" in yaml_text
    assert "--experimental.plugins.sablier.modulename=github.com/sablierapp/sablier-traefik-plugin" in yaml_text
    # v1.3.1 fails Traefik's plugin integrity check and disables every plugin (#1235).
    assert "--experimental.plugins.sablier.version=v1.3.0" in yaml_text
    assert "/etc/traefik/dynamic:ro" in yaml_text
    assert "wake-gateway:" in yaml_text
    assert "/root/.tilt-dev:ro" in yaml_text


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_standalone_compose_uses_selected_ingress_ports(tmp_path):
    r = _run_starlark(
        tmp_path,
        "os.environ['TDK_HTTP_PORT'] = '18080'\n"
        "os.environ['TDK_HTTPS_PORT'] = '18443'\n"
        "load('@COMPOSE/traefik_standalone.star', 'generate_standalone_traefik_compose')\n"
        "r = {'yaml': generate_standalone_traefik_compose(False, os.environ['TDK_HTTP_PORT'], os.environ['TDK_HTTPS_PORT'])}\n",
    )
    assert '\"127.0.0.1:18080:80\"' in r["yaml"]
    assert '\"127.0.0.1:18443:443\"' in r["yaml"]
    assert "--api.insecure" not in r["yaml"]


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_standalone_compose_bind_address_is_opt_in(tmp_path):
    """GHSA-3hj3-f39v-j2x5: dev ports stay on loopback unless TDK_BIND_ADDRESS is set."""
    r = _run_starlark(
        tmp_path,
        "load('@COMPOSE/traefik_standalone.star', 'generate_standalone_traefik_compose')\n"
        "r = {'yaml': generate_standalone_traefik_compose(False, '8080', '8443', '0.0.0.0')}\n",
    )
    assert '\"0.0.0.0:8080:80\"' in r["yaml"]
    assert '\"0.0.0.0:8443:443\"' in r["yaml"]


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_wake_gateway_mounts_project_root_at_its_own_absolute_path(tmp_path):
    """The gateway runs `docker compose up --no-build` with the same compose
    files Tilt uses; relative paths inside them resolve client-side, so the
    project must exist at the same absolute path in the gateway container."""
    r = _run_starlark(
        tmp_path,
        "os.environ['TDK_PROJECT_ROOT'] = '/Users/dev/tdk-erp-system/.tdk/.tdk-out/../..'\n"
        "load('@COMPOSE/traefik_standalone.star', 'generate_standalone_traefik_compose')\n"
        "r = {'yaml': generate_standalone_traefik_compose(True)}\n",
    )
    assert "- /Users/dev/tdk-erp-system:/Users/dev/tdk-erp-system:ro" in r["yaml"]
