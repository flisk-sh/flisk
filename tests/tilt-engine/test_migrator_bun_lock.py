# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Migrator image keeps the project's bun.lock (#4122).

The migrator's install step used to `rm -f bun.lock`, so every cold build resolved ~550 packages and
floated @prisma/client off the locked version. Executes the real Starlark through Tilt's interpreter and
runs the generated install step in a shell with a fake `bun`, to prove both branches.
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
RES = "services/guest/restaurant-migrator"


def migrator_dockerfile(tmp_path: Path) -> str:
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(
        f"load('{DOCKER_DIR}/layers/prisma/prisma_build.star', 'L3_generate_migration_engine')\n"
        f"fail('RESULT' + encode_json({{'df': L3_generate_migration_engine('{RES}')}}))\n"
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
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())["df"]


def install_step(df: str) -> str:
    prefix = "RUN --mount=type=cache,target=/cache/bun,sharing=shared "
    line = next(l for l in df.splitlines() if l.startswith(prefix) and "bun install" in l)
    return line[len(prefix):]


def test_install_step_does_not_delete_the_lockfile_up_front(tmp_path):
    df = migrator_dockerfile(tmp_path)
    step = install_step(df)

    assert "COPY bun.lock* ./" in df
    # `rm -f bun.lock` may only run in the fallback branch, never before the lockfile is tried.
    assert not step.startswith("rm -f bun.lock")
    assert step.index("--lockfile-only") < step.index("rm -f bun.lock")
    assert "--frozen-lockfile" in step
    # The reason sits next to the step.
    assert "#4122" in df


def run_step(tmp_path: Path, step: str, lock: str | None) -> tuple[str, list[str]]:
    """Run the generated install step with a fake bun; return (output, bun argument lines)."""
    work = tmp_path / "work"
    work.mkdir()
    if lock is not None:
        (work / "bun.lock").write_text(lock)
    fake = tmp_path / "bin"
    fake.mkdir()
    log = tmp_path / "bun.log"
    (fake / "bun").write_text(f'#!/bin/sh\necho "$@" >> {log}\nexit 0\n')
    (fake / "bun").chmod(0o755)
    (fake / "timeout").write_text('#!/bin/sh\nshift\nexec "$@"\n')
    (fake / "timeout").chmod(0o755)
    proc = subprocess.run(
        ["sh", "-c", step],
        cwd=work,
        capture_output=True,
        text=True,
        env={**os.environ, "PATH": f"{fake}:{os.environ['PATH']}"},
        timeout=30,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    return proc.stdout + proc.stderr, log.read_text().splitlines()


def test_lockfile_listing_the_workspace_is_pruned_and_installed_frozen(tmp_path):
    step = install_step(migrator_dockerfile(tmp_path))
    out, calls = run_step(tmp_path, step, f'{{ "workspaces": {{ "{RES}": {{ "name": "m" }} }} }}')

    assert calls[0].startswith("install --lockfile-only")
    assert calls[1].startswith("install --production --frozen-lockfile")
    assert (tmp_path / "work" / "bun.lock").exists()
    assert "resolving migrator dependencies without it" not in out


@pytest.mark.parametrize("lock", [None, '{ "workspaces": { "services/other/app": {} } }'])
def test_missing_or_foreign_lockfile_falls_back_and_says_so(tmp_path, lock):
    step = install_step(migrator_dockerfile(tmp_path))
    out, calls = run_step(tmp_path, step, lock)

    assert len(calls) == 1 and calls[0].startswith("install --production --no-frozen-lockfile")
    assert "resolving migrator dependencies without it" in out
    assert not (tmp_path / "work" / "bun.lock").exists()
