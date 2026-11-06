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
load('@RT/engine/topologies/tilt/common/windows_scripts.star', 'init_networks_script', 'healthy_postgres_script', 'provision_database_script', 'db_status_script', 'memory_summary_script', 'prebuild_image_script', 'pytest_script', 'healthy_script', 'job_done_script', 'typecheck_script', 'golden_build_script', 'tilt_image_tags_script')
load('@RT/engine/topologies/platform/docker/networking/traefik_static_routes.star', 'normalize_abs_path')
load('@RT/discovery/native_windows.star', 'file_mtime', 'POWERSHELL', 'python_script_command')
Database.provision('users')
Database.status_resource(True)
Database.memory_summary()
scripts = [init_networks_script(), healthy_postgres_script(), provision_database_script(), db_status_script(), memory_summary_script(), prebuild_image_script(), pytest_script(), healthy_script(), job_done_script(), typecheck_script(), golden_build_script(), tilt_image_tags_script()]
fail('RESULT' + encode_json({'scripts': scripts, 'ps': POWERSHELL, 'pycmd': python_script_command("C:/O'Brien/a b/conv.py", ["D:/x y/it's/service.json"]), 'norm': [normalize_abs_path('/a/./b/../c'), normalize_abs_path('')], 'mtime': [file_mtime('a.txt'), file_mtime('missing.txt')]}))
"""


def _run(tmp_path: Path, portable: bool = False) -> dict:
    project = tmp_path / "proj"
    (project / ".flisk").mkdir(parents=True)
    (project / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "proj"}}))
    (project / "a.txt").write_text("x")
    os.utime(project / "a.txt", (1700000000, 1700000000))
    (project / "Tiltfile").write_text(BODY.replace("@RT", str(RUNTIME)))
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(project / "Tiltfile")],
        capture_output=True, text=True, timeout=180, cwd=project,
        env={**os.environ, "FLISK_PROJECT_ROOT": str(project), **({"FLISK_DISCOVERY_PORTABLE": "1"} if portable else {})},
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
        if "exec -T" not in script:  # the pytest script runs sh inside the Linux container on purpose
            assert "/bin/" not in script and "bash" not in script and " sh " not in script
        assert script.count("{") == script.count("}") or "{{" in script, script
    assert result["mtime"] == [1700000000, 0]
    assert len(result["scripts"]) == 12
    assert result["norm"] == ["/a/c", ""]
    # the Python launcher command: PowerShell, UTF-8 mode, a --version probe per candidate, paths as single-quoted literals
    pycmd = result["pycmd"]
    assert pycmd[:4] == result["ps"] and len(pycmd) == 5
    body = pycmd[4]
    assert body.isascii() and '"' not in body
    assert "$env:PYTHONUTF8 = '1'" in body and "--version" in body and "'python3', 'python', 'py'" in body
    assert "& $py.Source 'C:/O''Brien/a b/conv.py' 'D:/x y/it''s/service.json'; exit $LASTEXITCODE" in body


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
    assert "if IS_NATIVE_WINDOWS:" in manifest and "file_mtime(json_abs)" in manifest and "python_script_command(" in manifest
    assert 'stat -f %m \\"$1\\" 2>/dev/null || stat -c %Y' in manifest


def test_path_normalizing_is_the_same_on_the_portable_path(tmp_path):
    # FLISK_DISCOVERY_PORTABLE=1 takes the Windows branch of normalize_abs_path; on a POSIX path it must change nothing
    posix = _run(tmp_path / "a")
    portable = _run(tmp_path / "b", portable=True)
    assert posix["norm"] == portable["norm"] == ["/a/c", ""]


def test_posix_commands_of_step_one_remainder_are_unchanged():
    orch = (TILT / "resources" / "orchestrator" / "apply_compose_resource_registration.star").read_text()
    for needle in [
        "'RUNNING_ID=$(docker compose -p \"$1\" -f \"$2\" ps --status running -q \"$3\" 2>/dev/null); ' +",
        "argv = ['sh', '-c', _HEALTHY_SCRIPT, 'sh', config['res_name'], str(timeout_s)]",
        "argv = ['sh', '-c', _JOB_DONE_SCRIPT, 'sh', config['res_name']]",
        "'sh', service_dir, typecheck_cmd,",
        "cmd_bat=POWERSHELL + [pytest_script()]",
        "cmd_bat=POWERSHELL + [prebuild_image_script()]",
    ]:
        assert needle in orch, needle
    assert "cmd=cmd,\n        cmd_bat=POWERSHELL + [golden_build_script()]," in (TILT.parent / "platform" / "docker" / "build" / "golden_image_build.star").read_text()
    assert "cmd=publish_cmd," in (TILT / "resources" / "libs_resource_definition.star").read_text()
    assert "serve_cmd=['sh', '-c', TILT_IMAGE_TAGS_SCRIPT, 'sh', repo_prefix]," in (TILT / "resources" / "tilt_image_tags.star").read_text()


def test_python_launcher_fails_loudly_and_passes_the_exit_code_on(tmp_path):
    """The PowerShell cannot run off Windows, so pin its failure paths by shape: a missing or broken python must stop the command."""
    body = _run(tmp_path)["pycmd"][4]
    # a broken Microsoft Store alias resolves but its --version fails, so the loop moves on to the next candidate
    assert "& $c.Source --version *> $null; if ($LASTEXITCODE -eq 0) { $py = $c; break }" in body
    # nothing usable: an actionable error and a non-zero exit before the script is ever called
    assert body.index("if (-not $py) { Write-Error 'python3, python or py is needed on PATH'; exit 1 }") < body.index("& $py.Source '")
    # a converter failure reaches Tilt as a non-zero exit instead of an empty success
    assert body.endswith("; exit $LASTEXITCODE")


CONVERTER = RUNTIME / "engine" / "topologies" / "tilt" / "manifest" / "json_to_yaml.py"


def _convert(path: Path):
    return subprocess.run(
        ["python3", str(CONVERTER), str(path)], capture_output=True, text=True, encoding="utf-8",
        env={**os.environ, "PYTHONUTF8": "1"},
    )


def test_converter_exits_nonzero_with_a_message_for_a_missing_or_invalid_manifest(tmp_path):
    pytest.importorskip("yaml")
    missing = _convert(tmp_path / "nope.json")
    assert missing.returncode != 0 and missing.stdout == "" and missing.stderr.startswith("Error:")
    (tmp_path / "bad.json").write_text("{not json")
    bad = _convert(tmp_path / "bad.json")
    assert bad.returncode != 0 and bad.stdout == "" and bad.stderr.startswith("Error:")


def test_converter_keeps_non_ascii_text(tmp_path):
    pytest.importorskip("yaml")
    manifest = tmp_path / "service.json"
    manifest.write_text(json.dumps({"appName": "café", "description": "Straße → 日本"}, ensure_ascii=False), encoding="utf-8")
    out = _convert(manifest)
    assert out.returncode == 0, out.stderr
    assert "café" in out.stdout and "Straße → 日本" in out.stdout
