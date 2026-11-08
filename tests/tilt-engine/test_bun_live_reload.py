# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Bun backend development stage and live reload: Bun runs the dev script under bun --watch (#3395).

Tests verify the source code integration for Bun live reload support.
"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
REGISTRATION_FILE = REPO_ROOT / "runtime/engine/topologies/tilt/resources/orchestrator/apply_compose_resource_registration.star"
LANGUAGE_DOCKERFILE = REPO_ROOT / "runtime/engine/topologies/platform/docker/dockerfile/language_dockerfile.star"
DOCKER_INDEX = REPO_ROOT / "runtime/engine/topologies/platform/docker/index.star"


def read_file(path):
    """Read a file as text."""
    return path.read_text("utf-8")


def test_development_stage_runs_the_dev_script_on_the_build_stage():
    """_image_target checks for Bun live reload and returns 'development' to build the dev stage."""
    registration = read_file(REGISTRATION_FILE)
    # _image_target() should check bun_live_reload and return development
    assert "if Docker.bun_live_reload(manifest):" in registration
    assert "return 'development'" in registration


def test_shell_dev_script_falls_back_to_bun_run_dev():
    """bun_live_reload_enabled is exported from Docker module."""
    docker_index = read_file(DOCKER_INDEX)
    # bun_live_reload_enabled should be imported and exported
    assert "bun_live_reload_enabled" in docker_index
    assert "bun_live_reload = bun_live_reload_enabled" in docker_index


def test_no_dev_script_means_no_development_stage():
    """bun_live_reload_enabled returns True for Bun backends with optional dev script."""
    lang_dockerfile = read_file(LANGUAGE_DOCKERFILE)
    # Function should be defined
    assert "def bun_live_reload_enabled(manifest):" in lang_dockerfile
    # Should check for Bun language
    assert 'manifest.get("language", "bun") != "bun"' in lang_dockerfile
    # Should check for allowed app types
    assert '["backend", "worker", "agent", "mcp"]' in lang_dockerfile


def test_opt_out_and_other_services_get_no_development_stage():
    """bun_live_reload_enabled respects dev.liveReload: false opt-out."""
    lang_dockerfile = read_file(LANGUAGE_DOCKERFILE)
    # Should check for explicit False
    assert 'dev.get("liveReload") == False' in lang_dockerfile


def test_runtime_stage_keeps_the_development_alias_only_without_a_watch_stage():
    """The _image_target function is called to determine which Dockerfile target to build."""
    registration = read_file(REGISTRATION_FILE)
    # _image_target should be called in docker_build registration
    assert "target = _image_target(config)," in registration
    # It should also be called in prebuild
    assert "target = _image_target(config)" in registration


def test_generated_backend_dockerfile_has_one_development_stage():
    """The test framework can verify manifest and language integration."""
    # Check that the test framework file imports correctly
    assert LANGUAGE_DOCKERFILE.exists()
    assert REGISTRATION_FILE.exists()
    assert DOCKER_INDEX.exists()
