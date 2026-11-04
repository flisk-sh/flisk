# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
The migrator image held node_modules three times (found by looking at `docker history` of a real agent-stack migrator: a 332 MB
COPY, a second 332 MB layer and a 101 MB one, 1.54 GB in all against 181 MB for the agent next to it).

`chown -R` over a directory a COPY has just put in the image stores every file again in a new layer. Ownership is now set by the
COPY itself (`--chown`), and the `chown -R` that follows leaves node_modules alone.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = [pytest.mark.generator]
TILT_REQUIRED = pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")

REPO_ROOT = Path(__file__).resolve().parents[2]
PRISMA_DIR = REPO_ROOT / "runtime" / "engine" / "topologies" / "platform" / "docker" / "layers" / "prisma"
RESULT_MARKER = "Error in fail: RESULT"


def run_starlark(tmp_path: Path, body: str) -> dict:
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(body.replace("@PRISMA", str(PRISMA_DIR)) + "\nfail('RESULT' + encode_json(r))\n")
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=180,
        env={**os.environ, "FLISK_PROJECT_ROOT": str(tmp_path)},
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@TILT_REQUIRED
def test_node_modules_is_chowned_by_the_copy_not_by_a_later_chown_r(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@PRISMA/filesystem_setup.star', 'prisma_dir_and_permissions')\n"
        "load('@PRISMA/prisma_runtime.star', 'L4_generate_migrator_runtime')\n"
        "r = {'perm': prisma_dir_and_permissions(), 'runtime': L4_generate_migrator_runtime('services/main/mig', 'mig', False)}\n",
    )
    # Only the part after `chown -R`: the `mkdir -p` in front of it names node_modules and is fine.
    chown_r = [line.split("chown -R", 1)[1] for line in result["perm"].splitlines() if "chown -R" in line]
    assert chown_r, "the prisma directory ownership fix is expected to remain"
    assert all("/app/node_modules" not in part for part in chown_r), chown_r
    copies = [line for line in result["runtime"].splitlines() if line.startswith("COPY") and "./node_modules" in line]
    assert copies and all("--chown=" in line for line in copies), copies
