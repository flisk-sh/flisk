# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
The native Windows discovery path (runtime/discovery/native_windows.star) must answer like the POSIX one.

Off Windows, FLISK_DISCOVERY_PORTABLE=1 forces the portable code path, so the same Tiltfile runs both ways
through Tilt's interpreter (`tilt alpha tiltfile-result`) and the results are compared. File writes go through
PowerShell on Windows and are not covered here.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")

DISCOVERY = Path(__file__).resolve().parents[2] / "runtime" / "discovery"

BODY = """
load('@DISCOVERY/libraries.star', 'autodiscover_libraries')
load('@DISCOVERY/native_windows.star', 'file_exists', 'dir_exists')
load('@DISCOVERY/json_manifest_scanner.star', 'discover_json_manifests')
r = {
    'missing': discover_json_manifests('nope'),
    'libs': autodiscover_libraries('libs', 'shared-'),
    'file': [file_exists('services/product/a/service.json'), file_exists('services/product/zzz'), file_exists('services/product/a')],
    'dir': [dir_exists('services/product/a'), dir_exists('services/product/zzz')],
    'scan': discover_json_manifests('services/product'),
    'glob': discover_json_manifests('services/pro*'),
}
"""


def _project(root: Path) -> Path:
    project = root / "proj"
    for rel in ["services/product/a", "services/product/b/c", "services/other/d", "libs/shared-x", "libs/shared-y", "libs/other-z"]:
        (project / rel).mkdir(parents=True)
    for rel in ["services/product/a/service.json", "services/product/b/c/service.json", "services/other/d/service.json", "libs/shared-x/index.ts", "libs/shared-y/index.ts"]:
        (project / rel).write_text("{}")
    (project / ".flisk").mkdir()
    (project / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "proj"}}))
    return project


def _run(project: Path, portable: bool) -> dict:
    tiltfile = project / "Tiltfile"
    tiltfile.write_text(BODY.replace("@DISCOVERY", str(DISCOVERY)) + "\nfail('RESULT' + encode_json(r))\n")
    env = {**os.environ, "FLISK_PROJECT_ROOT": str(project)}
    env.pop("FLISK_DISCOVERY_PORTABLE", None)
    if portable:
        env["FLISK_DISCOVERY_PORTABLE"] = "1"
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=180,
        cwd=project,
        env=env,
    )
    output = proc.stdout + proc.stderr
    marker = "Error in fail: RESULT"
    assert marker in output, output[-3000:]
    return json.loads(output.split(marker, 1)[1].strip())


def test_portable_discovery_matches_posix(tmp_path):
    project = _project(tmp_path)
    posix = _run(project, portable=False)
    portable = _run(project, portable=True)
    assert posix["scan"], posix
    for key in posix:
        assert sorted(portable[key]) == sorted(posix[key]), (key, posix[key], portable[key])
    assert portable["libs"] == ["shared-x", "shared-y"]
    assert portable["missing"] == []
