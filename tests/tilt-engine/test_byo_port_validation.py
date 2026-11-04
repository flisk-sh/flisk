# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""runtime/discovery/validation.star accepts the port an imported (bring-your-own) container listens on.

`flisk import` writes `"port": 80` for a Compose service on port 80, and manifest/validation.star accepts it, but the
loader's validation.star still required 3000-9999 and `flisk up` warned "Invalid port: 80" four times on a stack that ran
fine. Scaffolded services keep the 3000-9999 rule.
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
RESULT_MARKER = "Error in fail: RESULT"

BODY = """
load('@DISCOVERY/validation.star', 'validate')

def issues(app_type, port):
    return validate({'appName': 'vote', 'appType': app_type, 'stack': 'voting', 'port': port})

r = {
    'byo_80': issues('bring-your-own', 80),
    'byo_0': issues('bring-your-own', 0),
    'backend_80': issues('backend', 80),
}
"""


@pytest.fixture(scope="module")
def result(tmp_path_factory) -> dict:
    root = tmp_path_factory.mktemp("validation")
    (root / ".flisk").mkdir()
    (root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "starter"}}))
    tiltfile = root / "Tiltfile"
    tiltfile.write_text(BODY.replace("@DISCOVERY", str(REPO_ROOT / "runtime" / "discovery")) + "\nfail('RESULT' + encode_json(r))\n")
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True, text=True, timeout=180, cwd=root, env={**os.environ, "FLISK_PROJECT_ROOT": str(root)},
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


def _port_issues(issues: list[str]) -> list[str]:
    return [issue for issue in issues if "port" in issue.lower()]


def test_an_imported_service_keeps_port_80(result):
    assert _port_issues(result["byo_80"]) == []


def test_an_imported_port_outside_1_65535_is_still_rejected(result):
    assert _port_issues(result["byo_0"]) == ["Invalid port: 0. Must be integer 1-65535"]


def test_a_scaffolded_backend_keeps_the_3000_9999_rule(result):
    assert _port_issues(result["backend_80"]) == ["Invalid port: 80. Must be integer 3000-9999"]
