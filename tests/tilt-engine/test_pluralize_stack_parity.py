# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""Parity tests for the duplicate Traefik stack pluralization helpers."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(
    shutil.which("tilt") is None, reason="tilt CLI not installed"
)

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
FIXTURES = {
    "order": "orders",
    "order-management": "order-managements",
    "orders": "orders",
    "category": "categories",
    "box": "boxes",
}


def _run_pluralizer(tmp_path: Path, source_path: Path) -> list[str]:
    """Execute one real helper source as the Tiltfile and return its results."""
    source = source_path.read_text()
    if source_path.name == "traefik_helpers.star":
        source = source.replace(
            'load(\n    "./traefik_constants.star",',
            "load(\n    {},".format(
                json.dumps(str(source_path.parent / "traefik_constants.star")),
            ),
            1,
        )

    fixture_values = json.dumps(list(FIXTURES))
    tiltfile = tmp_path / (source_path.stem + "-Tiltfile")
    tiltfile.write_text(
        source
        + "\nr = {'outputs': [_pluralize_stack(value) for value in "
        + fixture_values
        + "]}\nfail('RESULT' + encode_json(r))\n"
    )
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=180,
        cwd=tmp_path,
        env={**os.environ, "FLISK_PROJECT_ROOT": str(tmp_path)},
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())["outputs"]


def test_pluralize_stack_implementations_match_single_and_multi_word_fixtures(tmp_path):
    helper_results = _run_pluralizer(
        tmp_path,
        NETWORKING_DIR / "traefik_helpers.star",
    )
    api_path_results = _run_pluralizer(
        tmp_path,
        NETWORKING_DIR / "api_path_constants.star",
    )

    expected = list(FIXTURES.values())
    assert helper_results == expected
    assert api_path_results == expected
    assert helper_results == api_path_results
