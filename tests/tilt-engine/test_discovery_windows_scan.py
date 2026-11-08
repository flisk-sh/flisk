# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
The PowerShell file scan used by discovery on native Windows (files_scan_command in runtime/discovery/native_windows.star).

Two layers:
- text checks on the script, read through Tilt's interpreter (run everywhere Tilt is installed): a drive root keeps its
  backslash, an enumeration error fails the scan instead of returning a partial list;
- runs of the script itself when PowerShell 7 (pwsh) is installed. Drive-root and UNC scans need Windows and are only covered
  by the text checks and by the hosted Windows run.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

DISCOVERY = Path(__file__).resolve().parents[2] / "runtime" / "discovery"

BODY = """
load('@DISCOVERY/native_windows.star', 'files_scan_command')
fail('RESULT' + encode_json(files_scan_command()))
"""


def _command(tmp_path: Path) -> list:
    (tmp_path / "Tiltfile").write_text(BODY.replace("@DISCOVERY", str(DISCOVERY)))
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tmp_path / "Tiltfile")],
        capture_output=True, text=True, timeout=180, cwd=tmp_path,
    )
    out = proc.stdout + proc.stderr
    assert "Error in fail: RESULT" in out, out[-3000:]
    return json.loads(out.split("Error in fail: RESULT", 1)[1].strip())


@pytest.fixture
def script(tmp_path):
    if shutil.which("tilt") is None:
        pytest.skip("tilt CLI not installed")
    return _command(tmp_path)[-1]


def test_enumeration_errors_fail_the_scan(script):
    assert "ErrorAction = 'Stop'" in script
    assert "SilentlyContinue" not in script.split("$p = @{", 1)[1]  # only the root lookup may be silent
    assert "exit 1" in script and "catch" in script
    assert script.rstrip().endswith("exit 0")


def test_a_drive_root_keeps_its_backslash(script):
    # TrimEnd turns C:\ into C:, the current directory on drive C; the scan must put the backslash back
    assert "$r.Length -eq 2 -and $r[1] -eq ':'" in script
    assert "$r = $r + [char]92" in script
    # relative paths are cut after the separator, which a drive root already ends with
    assert "$n = $r.Length; if ($r[$r.Length - 1] -ne [char]92) { $n = $n + 1 }" in script
    assert "Substring($n)" in script


pwsh = shutil.which("pwsh")
needs_pwsh = pytest.mark.skipif(pwsh is None or shutil.which("tilt") is None, reason="pwsh or tilt not installed")


def _scan(script: str, root: Path, name: str = "", depth: str = "") -> subprocess.CompletedProcess:
    env = {**os.environ, "FLISK_SCAN_ROOT": str(root), "FLISK_SCAN_NAME": name, "FLISK_SCAN_DEPTH": depth}
    return subprocess.run([pwsh, "-NoProfile", "-NonInteractive", "-Command", script], capture_output=True, text=True, env=env, timeout=120)


def _tree(root: Path):
    for rel in ["a/service.json", "a/b/service.json", "a/b/c/service.json", "a/readme.md", "node_modules/x/service.json"]:
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text("{}")


@needs_pwsh
def test_scan_lists_relative_files_filtered_by_name(script, tmp_path):
    _tree(tmp_path)
    proc = _scan(script, tmp_path, name="service.json")
    assert proc.returncode == 0, proc.stderr
    got = sorted(line.strip().replace("\\", "/") for line in proc.stdout.splitlines() if line.strip())
    assert got == ["a/b/c/service.json", "a/b/service.json", "a/service.json", "node_modules/x/service.json"]


@needs_pwsh
def test_scan_honours_depth(script, tmp_path):
    _tree(tmp_path)
    proc = _scan(script, tmp_path, name="service.json", depth="1")  # find -maxdepth 2
    got = sorted(line.strip().replace("\\", "/") for line in proc.stdout.splitlines() if line.strip())
    assert got == ["a/service.json"]


@needs_pwsh
def test_missing_root_is_an_empty_successful_scan(script, tmp_path):
    proc = _scan(script, tmp_path / "nope")
    assert proc.returncode == 0 and proc.stdout.strip() == ""


@needs_pwsh
@pytest.mark.skipif(os.name == "nt" or (hasattr(os, "geteuid") and os.geteuid() == 0), reason="needs a POSIX user that permissions apply to")
def test_an_unreadable_directory_fails_the_scan(script, tmp_path):
    _tree(tmp_path)
    locked = tmp_path / "a" / "b"
    locked.chmod(0)
    try:
        proc = _scan(script, tmp_path, name="service.json")
    finally:
        locked.chmod(0o755)
    assert proc.returncode != 0
    assert "flisk discovery scan failed" in proc.stderr
