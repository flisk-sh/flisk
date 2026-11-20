# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""Tests for the discovery watcher's exit conditions (#4014)."""

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "runtime/discovery"))
from resource_snapshot import watcher_should_stop


@pytest.mark.snapshot
class TestSnapshotWatchLifecycle:
    """A watcher must stop when Tilt stops, and when its project disappears."""

    def test_live_project_with_same_parent_keeps_watching(self, temp_dir, monkeypatch):
        monkeypatch.setattr("resource_snapshot.os.getppid", lambda: 4242)
        project = temp_dir / "demo"
        (project / ".flisk").mkdir(parents=True)
        (project / ".flisk" / "project.json").write_text("{}")

        assert watcher_should_stop(4242, project) is False

    def test_parent_pid_change_stops_the_watcher(self, temp_dir, monkeypatch):
        monkeypatch.setattr("resource_snapshot.os.getppid", lambda: 1)
        project = temp_dir / "demo"
        (project / ".flisk").mkdir(parents=True)
        (project / ".flisk" / "project.json").write_text("{}")

        assert watcher_should_stop(4242, project) is True

    def test_deleted_project_stops_the_watcher(self, temp_dir, monkeypatch):
        monkeypatch.setattr("resource_snapshot.os.getppid", lambda: 4242)

        assert watcher_should_stop(4242, temp_dir / "deleted") is True

    def test_tiltfile_replaces_the_shell_with_python(self):
        """Tilt must signal Python itself, not a shell that leaves an orphaned child."""
        template = (REPO_ROOT / "cli/templates/Tiltfile.hbs").read_text(encoding="utf-8")
        assert 'cd "$1" && exec python3 "$2" watch' in template
