# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""Direct tests for the Traefik Starlark helper functions."""

from __future__ import annotations

import json
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


def _run_starlark(tmp_path: Path, body: str) -> dict:
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(
        body.replace("@NETWORKING", str(NETWORKING_DIR))
        + "\nfail('RESULT' + encode_json(r))\n"
    )
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=180,
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


def test_backend_rule_uses_default_api_prefix(tmp_path):
    result = _run_starlark(
        tmp_path,
        """
load('@NETWORKING/traefik_helpers.star', 'backend_rule')
r = {'rule': backend_rule('orders.backend.testproj.local', '/api/orders-management')}
""",
    )

    assert result["rule"] == (
        "Host(`orders.backend.testproj.local`) || "
        "PathPrefix(`/api/orders-management`)"
    )


def test_backend_rule_uses_custom_api_prefix(tmp_path):
    result = _run_starlark(
        tmp_path,
        """
load('@NETWORKING/traefik_helpers.star', 'backend_rule')
r = {'rule': backend_rule('orders.backend.testproj.local', '/internal/orders')}
""",
    )

    assert result["rule"] == (
        "Host(`orders.backend.testproj.local`) || " "PathPrefix(`/internal/orders`)"
    )
