# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""Direct regression tests for frontend_rule in traefik_helpers.star."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = [
    pytest.mark.generator,
    pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed"),
]

REPO_ROOT = Path(__file__).resolve().parents[2]
NETWORKING_DIR = (
    REPO_ROOT
    / "runtime"
    / "engine"
    / "topologies"
    / "platform"
    / "docker"
    / "networking"
)
RESULT_MARKER = "Error in fail: RESULT"
PROJECT_NAME = "frontend-rule-test"


def run_frontend_rule(tmp_path: Path, body: str) -> str:
    """Evaluate a Starlark snippet through Tilt and return its generated rule."""
    project_root = tmp_path / PROJECT_NAME
    (project_root / ".flisk").mkdir(parents=True, exist_ok=True)
    (project_root / ".flisk" / "project.json").write_text(
        json.dumps({"project": {"name": PROJECT_NAME}})
    )
    tiltfile = project_root / "Tiltfile"
    tiltfile.write_text(
        body.replace("@NETWORKING", str(NETWORKING_DIR))
        + "\nfail('RESULT' + encode_json(r))\n"
    )
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=180,
        cwd=project_root,
        env={**os.environ, "FLISK_PROJECT_ROOT": str(project_root)},
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())["rule"]


def test_frontend_rule_at_root_path(tmp_path: Path):
    rule = run_frontend_rule(
        tmp_path,
        """
load('@NETWORKING/traefik_helpers.star', 'frontend_rule')
r = {'rule': frontend_rule('dashboard', '/', 'dashboard.frontend-rule-test.local')}
""",
    )

    assert rule == (
        "Host(`dashboard.localhost`) || Host(`dashboard.frontend-rule-test.local`) || "
        "(Host(`app.frontend-rule-test.localhost`) && PathPrefix(`/`)) || "
        "(Host(`localhost`) && PathPrefix(`/`))"
    )


def test_frontend_rule_with_custom_base_path(tmp_path: Path):
    rule = run_frontend_rule(
        tmp_path,
        """
load('@NETWORKING/traefik_helpers.star', 'frontend_rule')
r = {'rule': frontend_rule('dashboard', '/dashboard', 'dashboard.frontend-rule-test.local')}
""",
    )

    assert rule == (
        "Host(`dashboard.localhost`) || Host(`dashboard.frontend-rule-test.local`) || "
        "(Host(`app.frontend-rule-test.localhost`) && PathPrefix(`/dashboard`)) || "
        "(Host(`localhost`) && PathPrefix(`/dashboard`))"
    )
