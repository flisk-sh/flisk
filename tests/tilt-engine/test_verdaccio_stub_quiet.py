# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""The free-tier Verdaccio stub mentions the Premium license only when the project turned Verdaccio on.

A plain imported Compose app printed "Verdaccio skipped — requires a Flisk Premium license" on every free run, although
it never asked for Verdaccio.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = [pytest.mark.generator, pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")]

REPO_ROOT = Path(__file__).resolve().parents[2]
STUB = REPO_ROOT / "runtime" / "engine" / "topologies" / "platform" / "registries" / "verdaccio_loader.star"
NOTE = "requires a Flisk Premium license"


def _run(tmp_path: Path, enabled: bool) -> str:
    (tmp_path / ".flisk").mkdir(exist_ok=True)
    (tmp_path / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "starter"}}))
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(
        "load('{}', 'load_verdaccio')\nload_verdaccio(lambda name: {} and name == 'verdaccio')\nfail('DONE')\n".format(
            STUB, "True" if enabled else "False"
        )
    )
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True, text=True, timeout=180, cwd=tmp_path, env={**os.environ, "FLISK_PROJECT_ROOT": str(tmp_path)},
    )
    output = proc.stdout + proc.stderr
    assert "DONE" in output, output[-3000:]
    return output


def test_no_license_note_when_the_project_did_not_ask_for_verdaccio(tmp_path):
    assert NOTE not in _run(tmp_path, enabled=False)


def test_the_license_note_when_the_project_turned_verdaccio_on(tmp_path):
    assert NOTE in _run(tmp_path, enabled=True)
