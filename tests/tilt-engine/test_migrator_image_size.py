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


@TILT_REQUIRED
def test_migrator_image_runs_no_apk_add_of_its_own(tmp_path):
    # migrate.sh waits on the database with `nc` and reads Infisical with `curl` and `jq`; those tools now come from the
    # shared golden l4-migrator layer, so a migrator image adds no package layer of its own (flisk#3709).
    result = run_starlark(
        tmp_path,
        "load('@PRISMA/prisma_runtime.star', 'L4_generate_migrator_runtime')\n"
        "r = {'runtime': L4_generate_migrator_runtime('services/main/mig', 'mig', False)}\n",
    )
    assert "apk add" not in result["runtime"]


@TILT_REQUIRED
@pytest.mark.parametrize("use_golden", ["True", "False"])
def test_migrator_always_builds_on_the_golden_migrator_image(tmp_path, use_golden):
    # L4_generate_migrator_runtime ignores use_golden (the golden image is mandatory for a migrator), so jq and nc from the
    # golden layer are present whichever way the golden-image option is passed (flisk#3709).
    result = run_starlark(
        tmp_path,
        "load('@PRISMA/prisma_runtime.star', 'L4_generate_migrator_runtime')\n"
        "r = {'runtime': L4_generate_migrator_runtime('services/main/mig', 'mig', " + use_golden + ")}\n",
    )
    assert "-l4-migrator" in result["runtime"].split("AS l4_migrator_runtime", 1)[0].splitlines()[-1]


@TILT_REQUIRED
def test_pin_step_skips_bun_add_when_the_cli_is_already_installed_and_never_installs_dev_dependencies(tmp_path):
    # `bun add` after `bun install --production` installs devDependencies too: biome, typescript, vitest, vite and their native
    # binaries (about 330 MB) ended up in the migrator and the backend (flisk#3709).
    result = run_starlark(
        tmp_path,
        "load('@PRISMA/prisma_build.star', 'prisma_cli_pin_step')\n"
        "r = {'pin': prisma_cli_pin_step()}\n",
    )
    run = [line for line in result["pin"].splitlines() if line.startswith("RUN")]
    assert len(run) == 1, run
    assert "node_modules/prisma/package.json" in run[0]
    assert "until grep -Eq" in run[0] and "node_modules/prisma/package.json" in run[0]
    assert "bun add --no-save --exact prisma@" in run[0]
    assert "--production" not in run[0]


@TILT_REQUIRED
def test_migration_stage_installs_production_dependencies_then_the_pin_step_and_no_dev_install(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@PRISMA/prisma_build.star', 'L3_generate_migration_engine')\n"
        "r = {'stage': L3_generate_migration_engine('services/main/mig', False)}\n",
    )
    runs = [line for line in result["stage"].splitlines() if line.startswith("RUN") and "bun " in line]
    assert any("bun install --production" in line for line in runs), runs
    adds = [line for line in runs if "bun add" in line]
    assert adds and all("--production" not in line for line in adds), adds
