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
load('@DISCOVERY/native_windows.star', 'file_exists', 'dir_exists', 'find_files', 'is_abs_path')
load('@DISCOVERY/json_manifest_scanner.star', 'discover_json_manifests')
load('@DISCOVERY/manifest/loading.star', 'get_manifest_filename')
r = {
    'missing': discover_json_manifests('nope'),
    'libs': autodiscover_libraries('libs', 'shared-'),
    'file': [file_exists('services/product/a/service.json'), file_exists('services/product/zzz'), file_exists('services/product/a')],
    'dir': [dir_exists('services/product/a'), dir_exists('services/product/zzz'), dir_exists('services/product/a/service.json')],
    'manifest_name': [get_manifest_filename('services/product/a'), get_manifest_filename('services/product/zzz')],
    'spaces': discover_json_manifests('services/my team'),
    'unicode': discover_json_manifests('services/caf\u00e9'),
    'glob_dupes': discover_json_manifests('services/pro* services/product'),
    'scan': discover_json_manifests('services/product'),
    'glob': discover_json_manifests('services/pro*'),
    'clean_abs': find_files('@PROJ/services/product', 'service.json'),
    'unclean_abs': find_files('@PROJ//services/./other/../product', 'service.json'),
    'dotdot_root': find_files('@PROJ/.flisk/..', 'service.json'),
    'abs': [is_abs_path('/a/b'), is_abs_path('rel/b'), is_abs_path('C:\\\\x\\\\y'), is_abs_path('D:/x'), is_abs_path('\\\\\\\\srv\\\\share'), is_abs_path('')],
}
"""


def _project(root: Path) -> Path:
    project = root / "proj"
    for rel in ["services/product/a", "services/product/b/c", "services/other/d", "services/my team/svc one", "services/café/svc", "libs/shared-empty", "libs/shared-x", "libs/shared-y", "libs/other-z"]:
        (project / rel).mkdir(parents=True)
    for rel in ["services/product/a/service.json", "services/product/b/c/service.json", "services/other/d/service.json", "services/my team/svc one/service.json", "services/café/svc/service.json", "libs/shared-x/index.ts", "libs/shared-y/index.ts"]:
        (project / rel).write_text("{}")
    (project / ".flisk").mkdir()
    (project / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "proj"}}))
    return project


def _run(project: Path, portable: bool) -> dict:
    tiltfile = project / "Tiltfile"
    tiltfile.write_text(BODY.replace("@DISCOVERY", str(DISCOVERY)).replace("@PROJ", str(project)) + "\nfail('RESULT' + encode_json(r))\n")
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
        if key in ("libs", "abs"):  # "abs" differs by design: it is checked in its own test below
            continue
        if key == "glob_dupes":
            # the POSIX shell loop lists a manifest once per matching pattern; the portable path never repeats one
            assert set(portable[key]) == set(posix[key]), (key, posix[key], portable[key])
            continue
        assert sorted(portable[key], key=str) == sorted(posix[key], key=str), (key, posix[key], portable[key])
    assert portable["missing"] == []
    # a directory is not a file, a file is not a directory
    assert posix["dir"] == [True, False, False] == portable["dir"]
    # an existing service.json is detected, a missing one falls back to synthesis (None)
    assert posix["manifest_name"] == ["service.json", None] == portable["manifest_name"]
    assert len(posix["spaces"]) == 1 and len(posix["unicode"]) == 1
    assert len(set(portable["glob_dupes"])) == len(portable["glob_dupes"])
    # `ls -d` lists an empty directory; the file-based portable fallback (tests only) cannot see it
    assert posix["libs"] == ["shared-empty", "shared-x", "shared-y"]
    assert portable["libs"] == ["shared-x", "shared-y"]


def test_a_root_with_double_slash_dot_or_dotdot_finds_the_same_files(tmp_path):
    """Tilt's listdir returns cleaned paths while os.path.abspath keeps `//` and `..`; comparing them raw found no
    services on native Windows ("Loaded 0 services"), where the Tiltfile's root is config.main_dir + "/../..".
    """
    project = _project(tmp_path)
    for portable in (False, True):
        result = _run(project, portable=portable)
        # paths are shown under the root as given, so compare what follows the product directory
        below = lambda paths: sorted(p.split("/product/", 1)[1] for p in paths)
        assert below(result["clean_abs"]) == ["a/service.json", "b/c/service.json"], result["clean_abs"]
        assert below(result["unclean_abs"]) == below(result["clean_abs"]), result["unclean_abs"]
        # `.flisk/..` is the project root again: it finds every manifest under it
        assert len(result["dotdot_root"]) == 5, result["dotdot_root"]


def test_is_abs_path_is_startswith_slash_off_windows_and_knows_drives_on_it(tmp_path):
    """Code that put FLISK_PROJECT_ROOT in front of anything not starting with `/` doubled the prefix on a Windows path."""
    project = _project(tmp_path)
    posix = _run(project, portable=False)["abs"]
    portable = _run(project, portable=True)["abs"]
    assert posix == [True, False, False, False, False, False]
    assert portable == [True, False, True, True, True, False]
