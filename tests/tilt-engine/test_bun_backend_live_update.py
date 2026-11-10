# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""A saved edit to a Bun backend is served within seconds.

The image runs the compiled `dist/index.js` and holds no sources, so syncing `src/` alone changed nothing: Tilt reported
success and the old code kept running. Live update has to rebuild `dist/` and restart the process.
"""

from pathlib import Path

import pytest

pytestmark = [pytest.mark.fast, pytest.mark.generator]

REPO_ROOT = Path(__file__).resolve().parents[2]
TOPOLOGIES = REPO_ROOT / "runtime" / "engine" / "topologies"
REGISTRATION = TOPOLOGIES / "tilt" / "resources" / "orchestrator" / "apply_compose_resource_registration.star"
L4_LAYERS = TOPOLOGIES / "platform" / "docker" / "layers" / "l4_runtime_layers.star"


def _function(source: str, name: str) -> str:
    start = source.index(f"def {name}(")
    end = source.find("\ndef ", start + 1)
    return source[start:end]


def test_live_update_rebuilds_dist_then_restarts():
    rules = _function(REGISTRATION.read_text(), "_build_live_update_rules")
    build = rules.index("bun build ./src/")
    restart = rules.index("restart_container()")
    assert "--outdir dist" in rules
    assert build < restart, "restart_container must be the last live update step"
    assert restart > rules.rindex("live_update_rules.append(run("), "restart_container must follow every run step"


def test_rebuild_runs_only_when_a_source_changed():
    # A package.json change rebuilds the image (fall_back_on); only a source change rebuilds dist/ and restarts.
    rules = _function(REGISTRATION.read_text(), "_build_live_update_rules")
    assert "trigger=[_live_update_sync_source(project_root, full_res_path, 'src')]" in rules


def test_runtime_user_can_write_dist():
    # The process and every live update step run as bun; a root-owned dist/ fails with "Permission denied".
    assert '"COPY --chown=bun:bun --from=l3_backend_build /app/" + res_path + "/dist ./dist\\n"' in L4_LAYERS.read_text()


@pytest.mark.parametrize("excluded", ["manifest.get('language', 'bun') != 'bun'", "is_one_shot_job(manifest)"])
def test_only_long_running_bun_services_rebuild(excluded):
    assert excluded in _function(REGISTRATION.read_text(), "_bun_backend_entry")


def test_frontends_never_rebuild_dist():
    entry = _function(REGISTRATION.read_text(), "_bun_backend_entry")
    assert "['backend', 'worker', 'mcp', 'agent']" in entry
    assert "'frontend'" not in entry


def test_a_service_without_a_typescript_entry_keeps_its_old_rules():
    assert "os.path.exists(service_dir + '/src/' + entry + '.ts')" in _function(
        REGISTRATION.read_text(), "_bun_backend_entry"
    )


def test_dependency_changes_rebuild_the_image_first():
    rules = _function(REGISTRATION.read_text(), "_build_live_update_rules")
    fall_back = rules.index("fall_back_on([source_dir + name for name in _DEPENDENCY_FILES])")
    assert fall_back < rules.index("for sync_path in syncs:"), "fall_back_on must be the first live update step"
    assert "trigger=[package_json_path" not in rules
