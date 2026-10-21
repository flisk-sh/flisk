# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Golden layer set: one image per distinct stage, no duplicate images.

l3-migrator used to install the same Prisma as l3-backend, so every project got
two images with identical layers under different names. Migrators now build on
l3-backend, and the old name resolves to it.

Executes the real Starlark through Tilt's interpreter (`tilt alpha tiltfile-result`).
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = [
    pytest.mark.generator,
    pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed"),
]

DOCKER_DIR = Path(__file__).resolve().parents[2] / "engine" / "topologies" / "platform" / "docker"
RESULT_MARKER = "Error in fail: RESULT"


def run_starlark(tmp_path: Path, body: str) -> dict:
    """Run `body` in a Tiltfile; `body` must assign a dict to `r`. `@DOCKER` is the engine docker dir."""
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(body.replace("@DOCKER", str(DOCKER_DIR)) + "\nfail('RESULT' + encode_json(r))\n")
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        cwd=tmp_path,
        env={**os.environ, "TDK_PROJECT_ROOT": str(tmp_path)},
        timeout=180,
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@pytest.fixture
def golden(tmp_path):
    return run_starlark(
        tmp_path,
        "load('@DOCKER/build/golden_image_dockerfile.star', 'generate_golden_dockerfile')\n"
        "load('@DOCKER/build/golden_image_constants.star', 'GOLDEN_LAYERS', 'get_layer_reference')\n"
        "load('@DOCKER/layers/prisma/constants.star', 'DEFAULT_GOLDEN_L3_MIGRATOR_IMAGE')\n"
        "r = {\n"
        "  'df': generate_golden_dockerfile(),\n"
        "  'layers': {k: GOLDEN_LAYERS[k] for k in GOLDEN_LAYERS},\n"
        "  'migrator_ref': get_layer_reference('l3-migrator'),\n"
        "  'backend_ref': get_layer_reference('l3-backend'),\n"
        "  'prisma_l3_migrator': DEFAULT_GOLDEN_L3_MIGRATOR_IMAGE,\n"
        "}\n",
    )


def test_no_separate_l3_migrator_image_is_built(golden):
    assert "l3-migrator" not in golden["layers"]
    assert "AS l3_migrator_golden" not in golden["df"]


def test_migrator_runtime_copies_prisma_from_l3_backend(golden):
    stage = golden["df"].split("AS l4_migrator_golden", 1)[1].split("\nFROM ", 1)[0]
    assert "COPY --from=l3_backend_golden /root/.bun/install/global" in stage


def test_old_l3_migrator_name_resolves_to_l3_backend(golden):
    assert golden["migrator_ref"] == golden["backend_ref"]
    assert golden["prisma_l3_migrator"] == golden["backend_ref"]


def test_legacy_l3_migrator_image_is_listed_for_removal(tmp_path, golden):
    legacy_dir = tmp_path / "legacy"
    legacy_dir.mkdir()
    r = run_starlark(
        legacy_dir,
        "load('@DOCKER/build/golden_image_constants.star', 'LEGACY_GOLDEN_IMAGES')\n"
        "r = {'legacy': LEGACY_GOLDEN_IMAGES}\n",
    )
    assert r["legacy"] == [golden["backend_ref"].replace("-l3-backend:", "-l3-migrator:")]


def test_every_layer_target_and_copy_source_is_a_defined_stage(golden):
    stages = set(re.findall(r"^FROM \S+ AS (\S+)", golden["df"], re.M))
    for key, layer in golden["layers"].items():
        assert layer["target"] in stages, f"{key} targets missing stage {layer['target']}"
    for source in re.findall(r"^COPY --from=(\S+)", golden["df"], re.M):
        assert source in stages, f"COPY --from={source} has no matching stage"


def test_every_layer_builds_a_distinct_stage(golden):
    targets = [layer["target"] for layer in golden["layers"].values()]
    assert len(targets) == len(set(targets))
