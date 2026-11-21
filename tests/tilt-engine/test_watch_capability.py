# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""`capabilities.watch: false` in `.flisk/project.json` moves hot reload behind the
optional watch capability (#2234): the engine still registers docker_build, but with
no live-update rules, so a changed file rebuilds the image instead of syncing.
"""

from pathlib import Path

import pytest

pytestmark = [pytest.mark.fast, pytest.mark.generator]

REGISTRATION = (
    Path(__file__).resolve().parents[2]
    / "runtime"
    / "engine"
    / "topologies"
    / "tilt"
    / "resources"
    / "orchestrator"
    / "apply_compose_resource_registration.star"
)


def _function_source(signature: str, next_def: str) -> str:
    source = REGISTRATION.read_text()
    start = source.index(signature)
    return source[start : source.index(next_def, start)]


def test_watch_enabled_reads_capabilities_from_project_json():
    helper = _function_source("def _watch_enabled(", "\ndef _build_live_update_rules(")

    assert "project_json_path" in helper
    assert "capabilities" in helper
    assert "watch" in helper
    # Default is on: only an explicit false turns hot reload off.
    assert "!= False" in helper or "is False" not in helper


def test_live_update_rules_are_dropped_when_watch_is_off():
    function = _function_source("def _register_single_resource(", "\n_HEALTHY_SCRIPT")

    gate = "if not _watch_enabled(config.get('project_root', '')):"
    assert gate in function
    assert function.index(gate) < function.index("_register_docker_build(config, live_update_rules")
    # The gate clears the rules built just above it.
    assert "live_update_rules = []" in function[function.index(gate) :]


def test_docker_build_still_runs_without_live_update():
    # An empty rule list is the same shape rust/go live update already returns,
    # so docker_build registration itself is untouched by the capability.
    source = REGISTRATION.read_text()
    assert "live_update=live_update_rules" in (
        Path(__file__).resolve().parents[2]
        / "runtime"
        / "engine"
        / "topologies"
        / "tilt"
        / "resources"
        / "orchestrator"
        / "builders"
        / "typescript.star"
    ).read_text()
