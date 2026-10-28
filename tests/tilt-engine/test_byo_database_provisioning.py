# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Bring-your-own resources receive DATABASE_URL (docs/byo.md), so their stack database must be provisioned like a
backend's. Before this, only appType "backend" triggered `provision-db-<stack>`, and a bring-your-own api pointed at
a database that never existed and restarted in a loop.

Runs the real Starlark through Tilt's interpreter (`tilt alpha tiltfile-result`).
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
ORCHESTRATOR_DIR = REPO_ROOT / "runtime" / "engine" / "topologies" / "tilt" / "resources" / "orchestrator"
APPLY = ORCHESTRATOR_DIR / "apply.star"
RESULT_MARKER = "Error in fail: RESULT"


def run_starlark(tmp_path: Path, body: str) -> dict:
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(body.replace("@ORCHESTRATOR", str(ORCHESTRATOR_DIR)) + "\nfail('RESULT' + encode_json(r))\n")
    proc = subprocess.run(["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)], capture_output=True, text=True, timeout=180)
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@TILT_REQUIRED
def test_backend_bring_your_own_and_migrator_need_a_database(tmp_path: Path) -> None:
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'resource_needs_database')\n"
        "r = {t: resource_needs_database({'appType': t}) for t in ['backend', 'bring-your-own', 'migrator', 'frontend', 'worker', 'sdk']}\n"
        "r['missing'] = resource_needs_database({})\n"
        "r['none'] = resource_needs_database(None)\n",
    )
    assert result == {
        "backend": True,
        "bring-your-own": True,
        "migrator": True,
        "frontend": False,
        "worker": False,
        "sdk": False,
        "missing": False,
        "none": False,
    }


@TILT_REQUIRED
def test_agent_needs_a_database_only_with_postgres_durability(tmp_path: Path) -> None:
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'resource_needs_database')\n"
        "r = {\n"
        "  'postgres': resource_needs_database({'appType': 'agent', 'agent': {'runtime': 'custom', 'durability': 'postgres'}}),\n"
        "  'files': resource_needs_database({'appType': 'agent', 'agent': {'runtime': 'custom', 'durability': 'files'}}),\n"
        "  'no_agent_block': resource_needs_database({'appType': 'agent'}),\n"
        "  'not_an_agent': resource_needs_database({'appType': 'worker', 'agent': {'durability': 'postgres'}}),\n"
        "}\n",
    )
    assert result == {"postgres": True, "files": False, "no_agent_block": False, "not_an_agent": False}


def test_apply_provisions_through_the_shared_check() -> None:
    source = APPLY.read_text()
    assert "resource_needs_database(resource.get('_manifest', {}))" in source
    assert "manifest.get('appType') == 'backend'" not in source
