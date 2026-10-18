# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
"""
featuresEnabled "drizzle": accepted by the schema enum, validator warns without databaseName,
and the orchestrator counts it as a database dependency (no migrator service).
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = [pytest.mark.generator]
TILT_REQUIRED = pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")

REPO_ROOT = Path(__file__).resolve().parents[2]
VALIDATOR = REPO_ROOT / "engine" / "topologies" / "tilt" / "manifest" / "validator.star"
ORCHESTRATOR = REPO_ROOT / "engine" / "lifecycle" / "orchestrator.star"
SCHEMA = REPO_ROOT / "engine" / "schemas" / "service-schema.json"
RESULT_MARKER = "RESULT"


def run_starlark(tmp_path: Path, body: str) -> dict:
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(body + "\nfail('RESULT' + encode_json(r))\n")
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True, text=True, timeout=180,
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.JSONDecoder().raw_decode(output.split("Error in fail: RESULT", 1)[1].strip())[0]


def test_schema_enum_accepts_drizzle():
    schema = json.loads(SCHEMA.read_text())
    enum = schema["properties"]["featuresEnabled"]["items"]["enum"]
    assert "drizzle" in enum


@TILT_REQUIRED
def test_validator_warns_when_drizzle_has_no_database_name(tmp_path: Path):
    r = run_starlark(tmp_path, f"""
load('{VALIDATOR}', 'ManifestValidator')
v = ManifestValidator.validate({{'appName': 'orders-api', 'appType': 'backend', 'stack': 'orders', 'port': 4010, 'featuresEnabled': ['drizzle']}})
r = {{'valid': v.valid, 'warnings': [w.message for w in v.warnings]}}
""")
    assert r["valid"] is True
    assert any("'drizzle' feature should specify databaseName" in w for w in r["warnings"])


@TILT_REQUIRED
def test_orchestrator_adds_database_dependency_for_drizzle(tmp_path: Path):
    r = run_starlark(tmp_path, f"""
load('{ORCHESTRATOR}', 'should_wait_for_dependencies')
r = {{'deps': should_wait_for_dependencies({{'resources': [{{'_manifest': {{'featuresEnabled': ['drizzle']}}}}]}})}}
""")
    assert r["deps"] == ["database-management"]
