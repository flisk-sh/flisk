# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
The migrator build installs the Prisma CLI with its own `bun add`, because the CLI is usually a devDependency and the install
before it uses --production. It took the version from package.json with the ^ dropped, so "prisma": "^7.5.0" added
prisma@7.5.0 next to the @prisma/client 7.10.1 that the install had resolved. That downloaded a second Prisma (CLI, studio and
client): 94 packages, 39 s on an idle machine and 136 s in the demo, a 698 MB node_modules and a 1.5 GB image. It also generated
the client with a CLI older than the client.

The CLI version now comes from the @prisma/client that was installed, and the package.json range is only the fallback.
"""

from __future__ import annotations

import json
import os
import re
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


def prisma_cli_step(tmp_path: Path) -> str:
    """The generated RUN line that adds the Prisma CLI."""
    result = run_starlark(
        tmp_path,
        "load('@PRISMA/prisma_build.star', 'L3_generate_migration_engine')\n"
        "r = {'l3': L3_generate_migration_engine('services/main/mig', False)}\n",
    )
    steps = [line for line in result["l3"].splitlines() if line.startswith("RUN") and "prisma@" in line]
    assert len(steps) == 1, steps
    return steps[0]


def picked_version(step: str, workdir: Path) -> str:
    """Runs the part of the step that chooses PRISMA_VERSION, in workdir, and returns what it chose."""
    match = re.search(r"sharing=shared (PRISMA_VERSION=.*?) && n=0 && until", step)
    assert match, step
    script = match.group(1) + ' && printf "%s" "$PRISMA_VERSION"'
    proc = subprocess.run(["sh", "-c", script], cwd=workdir, capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stderr
    return proc.stdout


def write_manifest(workdir: Path) -> None:
    (workdir / "package.json").write_text(
        json.dumps({"dependencies": {"@prisma/client": "^7.5.0"}, "devDependencies": {"prisma": "^7.5.0"}}, indent=4)
    )


@TILT_REQUIRED
def test_prisma_cli_matches_the_installed_client(tmp_path):
    step = prisma_cli_step(tmp_path)
    workdir = tmp_path / "app"
    client = workdir / "node_modules" / "@prisma" / "client"
    client.mkdir(parents=True)
    write_manifest(workdir)
    (client / "package.json").write_text(json.dumps({"name": "@prisma/client", "version": "7.10.1"}, indent=2))
    assert picked_version(step, workdir) == "7.10.1"


@TILT_REQUIRED
def test_prisma_cli_falls_back_to_the_package_json_range_without_a_client(tmp_path):
    step = prisma_cli_step(tmp_path)
    workdir = tmp_path / "app"
    workdir.mkdir()
    write_manifest(workdir)
    assert picked_version(step, workdir) == "7.5.0"
