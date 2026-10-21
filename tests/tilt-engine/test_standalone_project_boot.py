# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""Regression tests for standalone generated-project boot.

Standalone Flisk projects do not ship Traefik/Verdaccio compose files. The
Tiltfile still has to load the project-root .env and publish host ports so
the generated API is reachable at localhost:<port>.
"""

from pathlib import Path

import pytest

pytestmark = [pytest.mark.fast, pytest.mark.generator]

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_load_dotenv_uses_tdk_project_root():
    source = (
        REPO_ROOT
        / "engine"
        / "topologies"
        / "tilt"
        / "common"
        / "utils_env.star"
    ).read_text()
    assert "TDK_PROJECT_ROOT" in source
    assert "if not project_root:" in source


def test_tiltfile_template_passes_project_root_to_load_dotenv():
    source = (REPO_ROOT / "cli" / "templates" / "Tiltfile.hbs").read_text()
    assert "Utils.load_dotenv(PROJECT_ROOT)" in source
    assert "Utils.load_dotenv()" not in source


def test_compose_registration_applies_port_override_when_present():
    source = (
        REPO_ROOT
        / "engine"
        / "topologies"
        / "tilt"
        / "resources"
        / "orchestrator"
        / "apply_compose_resource_registration.star"
    ).read_text()
    assert "docker-compose.port-override.yml" in source
    assert "Applying port override" in source


def test_verdaccio_dependency_requires_compose_file():
    source = (
        REPO_ROOT
        / "engine"
        / "topologies"
        / "tilt"
        / "resources"
        / "orchestrator"
        / "apply_compose_resource_registration.star"
    ).read_text()
    assert "docker-compose.verdaccio.yml" in source
    assert "infra_deps.append(PlatformDockerConstants.VERDACCIO_RESOURCE_NAME)" in source
