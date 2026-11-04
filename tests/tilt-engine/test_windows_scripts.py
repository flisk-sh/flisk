# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Native Windows host scripts (runtime/engine/topologies/tilt/common/windows_scripts.star).

The PowerShell branches (cmd_bat) cannot run off Windows and are NOT verified on a real Windows machine.
What is checked here, through Tilt's interpreter:
- the POSIX command of every converted local_resource is unchanged (Tilt ignores cmd_bat off Windows),
- the PowerShell scripts follow the authoring rules (ASCII, no double quotes, no sh/bash),
- file_mtime answers like `stat` for a file and a missing path.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")

RUNTIME = Path(__file__).resolve().parents[2] / "runtime"
TILT = RUNTIME / "engine" / "topologies" / "tilt"

BODY = """
load('@RT/engine/topologies/tilt/resources/databases.star', 'Database')
load('@RT/engine/topologies/tilt/common/windows_scripts.star', 'init_networks_script', 'healthy_postgres_script', 'provision_database_script', 'db_status_script', 'memory_summary_script')
load('@RT/discovery/native_windows.star', 'file_mtime', 'POWERSHELL')
Database.provision('users')
Database.status_resource(True)
Database.memory_summary()
scripts = [init_networks_script(), healthy_postgres_script(), provision_database_script(), db_status_script(), memory_summary_script()]
fail('RESULT' + encode_json({'scripts': scripts, 'ps': POWERSHELL, 'mtime': [file_mtime('a.txt'), file_mtime('missing.txt')]}))
"""


def _run(tmp_path: Path) -> dict:
    project = tmp_path / "proj"
    (project / ".flisk").mkdir(parents=True)
    (project / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "proj"}}))
    (project / "a.txt").write_text("x")
    os.utime(project / "a.txt", (1700000000, 1700000000))
    (project / "Tiltfile").write_text(BODY.replace("@RT", str(RUNTIME)))
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(project / "Tiltfile")],
        capture_output=True, text=True, timeout=180, cwd=project,
        env={**os.environ, "FLISK_PROJECT_ROOT": str(project)},
    )
    out = proc.stdout + proc.stderr
    assert "Error in fail: RESULT" in out, out[-3000:]
    return json.loads(out.split("Error in fail: RESULT", 1)[1].strip())


def test_scripts_follow_authoring_rules_and_mtime_matches_stat(tmp_path):
    result = _run(tmp_path)
    assert result["ps"][0] == "powershell"
    for script in result["scripts"]:
        assert script.isascii(), script
        assert '"' not in script, script
        assert "/bin/" not in script and "bash" not in script and " sh " not in script
        assert script.count("{") == script.count("}") or "{{" in script, script
    assert result["mtime"] == [1700000000, 0]


def test_posix_commands_of_converted_resources_are_unchanged():
    # the POSIX command stays at every converted site; cmd_bat is an addition next to it
    dbs = (TILT / "resources" / "databases.star").read_text()
    assert "cmd=['bash', '-c', provision_cmd]," in dbs
    assert "cmd_bat=POWERSHELL + [provision_database_script()]" in dbs
    infra = (TILT / "resources" / "infra-loader.star").read_text()
    assert "cmd=['sh', '-c', _HEALTHY_POSTGRES_SCRIPT, 'sh', PlatformDockerConstants.PROJECT_NAME]," in infra
    assert "cmd=fix_docker_networks_fn()," in infra
    assert "cmd_bat=POWERSHELL + [healthy_postgres_script()]" in infra
    assert "cmd_bat=POWERSHELL + [init_networks_script()]" in infra
    manifest = (TILT / "resources" / "orchestrator" / "generators" / "manifest_resource.star").read_text()
    assert "file_mtime(json_path)" in manifest and "IS_NATIVE_WINDOWS" not in manifest
