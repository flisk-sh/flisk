# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Tests for Tilt image pruning wired from watchers.star.

Covers two things:
- every cleanup script path that watchers.star runs exists in the engine
  tree that init vendors into .flisk/.flisk-out/flisk-cli-ext/ (regression: the
  paths used to point at a .flisk-out/ext/ tree that init never creates)
- cleanup-tilt-images.sh keeps only the newest N tilt-* builds per repo
"""

import os
import re
import stat
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
WATCHERS = REPO_ROOT / "runtime" / "engine" / "topologies" / "tilt" / "resources" / "watchers.star"
SCRIPTS_DIR = REPO_ROOT / "runtime" / "engine" / "assets" / "scripts"
VENDORED_PREFIX = ".flisk/.flisk-out/flisk-cli-ext/engine/assets/scripts/"
CLEANUP = SCRIPTS_DIR / "cleanup-tilt-images.sh"


@pytest.mark.safety
class TestWatcherScriptPaths:
    """Paths in watchers.star must match where init vendors the scripts."""

    def test_referenced_scripts_exist_in_vendored_layout(self):
        text = WATCHERS.read_text(encoding="utf-8")
        referenced = re.findall(r"\./" + re.escape(VENDORED_PREFIX) + r"([\w.-]+\.sh)", text)

        assert referenced, "watchers.star should reference vendored cleanup scripts"
        for name in set(referenced):
            script = SCRIPTS_DIR / name
            assert script.is_file(), f"{name} is referenced by watchers.star but missing from engine/assets/scripts"

    def test_referenced_scripts_are_executable(self):
        if os.name == "nt":
            pytest.skip("POSIX exec bits only")
        text = WATCHERS.read_text(encoding="utf-8")
        referenced = set(re.findall(r"\./" + re.escape(VENDORED_PREFIX) + r"([\w.-]+\.sh)", text))

        for name in referenced:
            mode = (SCRIPTS_DIR / name).stat().st_mode
            assert mode & stat.S_IXUSR, f"{name} must be executable; watchers call it as ./path"

    def test_no_reference_to_stale_ext_assets_path(self):
        text = WATCHERS.read_text(encoding="utf-8")
        assert ".flisk-out/ext/assets/" not in text

    @staticmethod
    def _utility_resources() -> dict[str, str]:
        text = WATCHERS.read_text(encoding="utf-8")
        start = text.index("def setup_utility_resources():")
        end = text.index("\ndef ", start + 1)
        body = text[start:end]
        return {
            name: definition
            for name, definition in re.findall(
                r"local_resource\(\s*'([^']+)',(.*?)\n    \)", body, re.S
            )
        }

    def test_no_unscoped_cleanup_loops_are_generated(self):
        resources = self._utility_resources()

        assert "auto-prune-dangling" not in resources
        assert "auto-prune-migrator-images" not in resources
        for name, definition in resources.items():
            if "serve_cmd" not in definition:
                continue
            assert "auto_init=True" not in definition, f"{name} starts a loop automatically"
            for command in (
                "docker image prune -f",
                "cleanup-tilt-images.sh",
                "cleanup-completed-migrator-images.sh",
            ):
                assert command not in definition, f"{name} runs unscoped cleanup: {command}"


@pytest.mark.safety
@pytest.mark.skipif(os.name == "nt", reason="runs a POSIX shell script")
class TestCleanupTiltImagesKeep:
    """cleanup-tilt-images.sh --keep N removes only builds older than the newest N."""

    @staticmethod
    def _fake_docker(bin_dir: Path, log: Path, rows: str) -> None:
        rows_file = bin_dir / "rows.txt"
        rows_file.write_text(rows, encoding="utf-8")
        docker = bin_dir / "docker"
        docker.write_text(
            "#!/bin/bash\n"
            'if [ "$1" = "image" ] && [ "$2" = "ls" ]; then cat "' + str(rows_file) + '"; exit 0; fi\n'
            'if [ "$1" = "rmi" ]; then echo "$2" >> "' + str(log) + '"; exit 0; fi\n'
            "exit 0\n",
            encoding="utf-8",
        )
        docker.chmod(docker.stat().st_mode | stat.S_IXUSR)

    def _run(self, tmp_path: Path, rows: str, *args: str) -> tuple[subprocess.CompletedProcess, list[str]]:
        bin_dir = tmp_path / "bin"
        bin_dir.mkdir()
        log = tmp_path / "rmi.log"
        self._fake_docker(bin_dir, log, rows)
        env = {**os.environ, "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}
        result = subprocess.run(
            ["bash", str(CLEANUP), *args],
            capture_output=True,
            text=True,
            env=env,
            check=False,
        )
        removed = log.read_text(encoding="utf-8").split() if log.exists() else []
        return result, removed

    def test_keep_two_removes_only_older_builds(self, tmp_path):
        rows = (
            "svc tilt-a id-a 2026-10-01 10:00:00 +0200 CEST\n"
            "svc tilt-b id-b 2026-10-02 10:00:00 +0200 CEST\n"
            "svc tilt-c id-c 2026-10-03 10:00:00 +0200 CEST\n"
            "svc tilt-d id-d 2026-10-04 10:00:00 +0200 CEST\n"
        )

        result, removed = self._run(tmp_path, rows, "--keep", "2", "--force")

        assert result.returncode == 0, result.stderr
        assert sorted(removed) == ["id-a", "id-b"]

    def test_dry_run_removes_nothing(self, tmp_path):
        rows = (
            "svc tilt-a id-a 2026-10-01 10:00:00 +0200 CEST\n"
            "svc tilt-b id-b 2026-10-02 10:00:00 +0200 CEST\n"
            "svc tilt-c id-c 2026-10-03 10:00:00 +0200 CEST\n"
        )

        result, removed = self._run(tmp_path, rows, "--keep", "2")

        assert result.returncode == 0, result.stderr
        assert removed == []
        assert "Dry-run only" in result.stdout

    def test_fewer_builds_than_keep_removes_nothing(self, tmp_path):
        rows = "svc tilt-a id-a 2026-10-01 10:00:00 +0200 CEST\n"

        result, removed = self._run(tmp_path, rows, "--keep", "2", "--force")

        assert result.returncode == 0, result.stderr
        assert removed == []
