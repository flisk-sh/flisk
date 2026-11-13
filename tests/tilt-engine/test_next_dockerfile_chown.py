# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
The Next.js frontend image stored node_modules twice: `RUN chown -R app:app /app/<res>` ran after `npm install`, and a recursive
chown over a directory already in the image writes every file again into a new layer. Measured on a minimal Next 16 app with the
same Dockerfile shape: that layer was 387 MB and took about 16 s, and the image was 396 MB against 178 MB without it.

Ownership is now set by the COPYs (`--chown`), and the development stage chowns only the app folder and `.next` (what `next dev`
has to create files in), never what is inside them.
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
DOCKERFILE_DIR = REPO_ROOT / "runtime" / "engine" / "topologies" / "platform" / "docker" / "dockerfile"
RESULT_MARKER = "Error in fail: RESULT"


def next_dockerfile(tmp_path: Path, use_golden: str) -> str:
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(
        f"load('{DOCKERFILE_DIR}/next_dockerfile.star', 'generate_next_dockerfile')\n"
        f"r = generate_next_dockerfile('services/main/web', 3000, {use_golden})\n"
        "fail('RESULT' + encode_json({'text': r}))\n"
    )
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=180,
        env={**os.environ, "FLISK_PROJECT_ROOT": str(tmp_path)},
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())["text"]


@TILT_REQUIRED
@pytest.mark.parametrize(("use_golden", "run_user"), [("True", "app"), ("False", "node")])
def test_no_recursive_chown_over_the_app_folder(tmp_path, use_golden, run_user):
    text = next_dockerfile(tmp_path, use_golden)
    instructions = [line for line in text.splitlines() if not line.lstrip().startswith("#")]  # comments may name chown -R
    assert not [line for line in instructions if "chown -R" in line], instructions
    # next dev still needs the app folder and .next to be writable by the run user.
    chowns = [line for line in instructions if line.startswith("RUN") and "chown" in line]
    assert len(chowns) == 1, chowns
    assert f"chown {run_user}:{run_user} /app/services/main/web /app/services/main/web/.next" in chowns[0]
    assert "mkdir -p .next" in chowns[0]


@TILT_REQUIRED
@pytest.mark.parametrize(("use_golden", "run_user"), [("True", "app"), ("False", "node")])
def test_every_source_copy_in_the_base_stage_sets_its_owner(tmp_path, use_golden, run_user):
    text = next_dockerfile(tmp_path, use_golden)
    base = text.split("AS development", 1)[0]
    sources = [
        line
        for line in base.splitlines()
        if line.startswith("COPY") and not line.startswith("COPY services/main/web/package.json")
    ]
    assert len(sources) == 5, sources  # .env, next.config.mjs, tsconfig.json, public, src
    assert all(f"--chown={run_user}:{run_user}" in line for line in sources), sources
