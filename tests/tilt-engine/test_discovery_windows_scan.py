# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Native Windows file scan (files_scan_command in runtime/discovery/native_windows.star).

PowerShell cannot run off Windows, so these tests check the generated script, through Tilt's interpreter, for the two rules the
scan must keep: an unreadable directory fails the scan instead of silently dropping files, and a drive root keeps its separator.
A pwsh run of the same script is added when pwsh is installed.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")

RUNTIME = Path(__file__).resolve().parents[2] / "runtime"

BODY = """
load('@RT/discovery/native_windows.star', 'files_scan_command')
fail('RESULT' + encode_json(files_scan_command()))
"""


def _script(tmp_path: Path) -> str:
    project = tmp_path / "proj"
    (project / ".flisk").mkdir(parents=True)
    (project / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "proj"}}))
    (project / "Tiltfile").write_text(BODY.replace("@RT", str(RUNTIME)))
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(project / "Tiltfile")],
        capture_output=True, text=True, timeout=180, cwd=project,
        env={**os.environ, "FLISK_PROJECT_ROOT": str(project)},
    )
    out = proc.stdout + proc.stderr
    assert "Error in fail: RESULT" in out, out[-3000:]
    return json.loads(out.split("Error in fail: RESULT", 1)[1].strip())[-1]


def test_enumeration_errors_fail_the_scan_but_a_missing_root_is_empty(tmp_path):
    body = _script(tmp_path)
    assert body.isascii() and '"' not in body
    # the missing root is the only silent path, and it comes before the enumeration
    resolve, enumerate_ = body.index("Resolve-Path"), body.index("Get-ChildItem")
    assert "SilentlyContinue" in body[:enumerate_] and "if (-not $r) { exit 0 }" in body[resolve:enumerate_]
    # enumeration itself uses terminating errors and reports failure with a non-zero exit
    assert "SilentlyContinue" not in body[enumerate_:] and "ErrorAction = 'Stop'" in body
    assert "SilentlyContinue" not in body.split("$p = @{", 1)[1]
    assert "catch {" in body and "exit 1" in body and "flisk discovery scan failed" in body


def test_a_drive_root_keeps_its_separator_and_its_prefix_length(tmp_path):
    body = _script(tmp_path)
    # TrimEnd turns C:\ into C: (the current directory on that drive), so the separator is restored for a bare drive
    assert "$r.Length -eq 2 -and $r[1] -eq [char]58" in body
    assert "$r += [char]92" in body
    # the relative-path offset is the root length (separator included) for a drive root, length + 1 otherwise
    assert "$o = $r.Length + 1" in body and "$o = $r.Length }" in body
    assert "Substring($o)" in body and "Substring($r.Length + 1)" not in body


@pytest.mark.skipif(shutil.which("pwsh") is None, reason="pwsh not installed")
def test_scan_lists_relative_files_and_a_missing_root_is_empty(tmp_path):
    body = _script(tmp_path)
    root = tmp_path / "scan"
    (root / "a" / "b").mkdir(parents=True)
    (root / "a" / "b" / "service.json").write_text("{}")

    def run(path):
        return subprocess.run(["pwsh", "-NoProfile", "-Command", body], capture_output=True, text=True,
                              env={**os.environ, "FLISK_SCAN_ROOT": str(path), "FLISK_SCAN_NAME": "service.json"})

    found = run(root)
    assert found.returncode == 0 and found.stdout.split() == [str(Path("a") / "b" / "service.json")]
    missing = run(tmp_path / "nope")
    assert missing.returncode == 0 and missing.stdout.strip() == ""
