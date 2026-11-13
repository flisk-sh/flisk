# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
The migrator installs the @prisma/client version the project locked (#4122).

The install step deletes bun.lock (a frozen install is ~6x slower cold, #4131), so `^7.5.0` floated to the newest 7.x.
The step now reads the locked versions out of the text bun.lock with sed and writes them into the image's package.json
before the install. Runs the real Starlark through Tilt, then the generated shell against fixture files with a fake bun.
"""

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

DOCKER_DIR = Path(__file__).resolve().parents[2] / "runtime" / "engine" / "topologies" / "platform" / "docker"
RESULT_MARKER = "Error in fail: RESULT"
PREFIX = "RUN --mount=type=cache,target=/cache/bun,sharing=shared "

LOCK = """{
  "lockfileVersion": 1,
  "packages": {
    "@prisma/client": ["@prisma/client@7.5.2", "", { "dependencies": { "@prisma/client-runtime-utils": "7.5.2" } }, "sha512-x"],
    "@prisma/client-runtime-utils": ["@prisma/client-runtime-utils@7.5.2", "", {}, "sha512-y"],
    "prisma": ["prisma@7.5.2", "", {}, "sha512-z"],
  }
}
"""
MANIFEST = {
    "name": "m",
    "dependencies": {"@prisma/client": "^7.5.0"},
    "devDependencies": {"prisma": "^7.5.0", "typescript": "^5.7.2"},
}


def install_step(tmp_path: Path) -> str:
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(
        f"load('{DOCKER_DIR}/layers/prisma/prisma_build.star', 'L3_generate_migration_engine')\n"
        "fail('RESULT' + encode_json({'df': L3_generate_migration_engine('services/guest/m')}))\n"
    )
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        env={**os.environ, "FLISK_PROJECT_ROOT": str(tmp_path)},
        timeout=180,
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    df = json.loads(output.split(RESULT_MARKER, 1)[1].strip())["df"]
    line = next(l for l in df.splitlines() if l.startswith(PREFIX) and "bun install" in l)
    return line[len(PREFIX):]


def run_step(tmp_path: Path, lock: str | None) -> dict:
    """Run the generated install step with a fake bun; return the package.json bun was asked to install from."""
    step = install_step(tmp_path)
    work = tmp_path / "work"
    work.mkdir()
    (work / "package.json").write_text(json.dumps(MANIFEST, indent=4))
    if lock is not None:
        (work / "bun.lock").write_text(lock)
    fake = tmp_path / "bin"
    fake.mkdir()
    (fake / "bun").write_text(f"#!/bin/sh\ncp package.json {tmp_path}/seen.json\nexit 0\n")
    (fake / "timeout").write_text('#!/bin/sh\nshift\nexec "$@"\n')
    for name in ("bun", "timeout"):
        (fake / name).chmod(0o755)
    proc = subprocess.run(
        ["sh", "-c", step],
        cwd=work,
        capture_output=True,
        text=True,
        env={**os.environ, "PATH": f"{fake}:{os.environ['PATH']}"},
        timeout=30,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    return json.loads((tmp_path / "seen.json").read_text())


def test_client_and_cli_are_pinned_to_the_locked_version(tmp_path):
    seen = run_step(tmp_path, LOCK)
    assert seen["dependencies"]["@prisma/client"] == "7.5.2"
    assert seen["devDependencies"]["prisma"] == "7.5.2"
    # Nothing else in the manifest is touched.
    assert seen["devDependencies"]["typescript"] == "^5.7.2"
    assert seen["name"] == "m"


def test_lockfile_is_still_deleted_so_the_cold_path_stays_fast(tmp_path):
    run_step(tmp_path, LOCK)
    assert not (tmp_path / "work" / "bun.lock").exists()
    assert "--no-frozen-lockfile" in install_step(tmp_path)


def test_without_a_lockfile_the_ranges_are_left_alone(tmp_path):
    seen = run_step(tmp_path, None)
    assert seen["dependencies"]["@prisma/client"] == "^7.5.0"
    assert seen["devDependencies"]["prisma"] == "^7.5.0"


def test_lockfile_without_prisma_entries_leaves_ranges_alone(tmp_path):
    seen = run_step(tmp_path, '{ "packages": { "left-pad": ["left-pad@1.3.0", "", {}, "x"] } }')
    assert seen["dependencies"]["@prisma/client"] == "^7.5.0"
