# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""Checkout identity in the Tilt environment (`utils_env.star`).

`_load_checkout_env` gives a directly started Tilt the checkout id from `.flisk/.project-id`, but only when
the record names the current checkout: a copy that kept the source's file must not reuse the source's id.
`load_dotenv` must never let the project env file override `FLISK_CHECKOUT_ID` / `FLISK_CHECKOUT_NAME`,
because the file can be committed and copied while the identity belongs to this checkout.

The executed cases run the real Starlark through Tilt's interpreter (`tilt alpha tiltfile-result`), like
test_byo_env.py; the source cases keep checking the contract when the tilt CLI is not installed.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
UTILS_ENV = REPO_ROOT / "runtime" / "engine" / "topologies" / "tilt" / "common" / "utils_env.star"

RESULT_MARKER = "Error in fail: RESULT"
TILT_REQUIRED = pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")

BODY = """load('{utils_env}', 'load_dotenv')
load_dotenv('{project_root}')
report = {
    'id': os.environ.get('FLISK_CHECKOUT_ID', ''),
    'name': os.environ.get('FLISK_CHECKOUT_NAME', ''),
    'other': os.environ.get('ORDINARY_KEY', ''),
}
fail('RESULT' + encode_json(report))
"""


def write_record(project_root: Path, id_value: str, path_value: str) -> None:
    record_dir = project_root / ".flisk"
    record_dir.mkdir(parents=True, exist_ok=True)
    (record_dir / ".project-id").write_text(json.dumps({"id": id_value, "path": path_value}) + "\n")


def run_tilt(project_root: Path) -> dict:
    tiltfile = project_root / "Tiltfile"
    tiltfile.write_text(
        BODY.replace("{utils_env}", str(UTILS_ENV)).replace("{project_root}", str(project_root))
    )
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=120,
        cwd=project_root,
        # A directly started Tilt has no `flisk up` before it, so no exported identity is inherited.
        env={k: v for k, v in os.environ.items() if not k.startswith("FLISK_CHECKOUT")},
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@pytest.fixture()
def project(tmp_path: Path) -> Path:
    root = tmp_path / "checkout-env-project"
    root.mkdir(parents=True, exist_ok=True)
    return root


@pytest.mark.fast
def test_source_keeps_the_identity_out_of_the_dotenv_loop():
    source = UTILS_ENV.read_text()
    assert "_CHECKOUT_IDENTITY_NAMES = ('FLISK_CHECKOUT_ID', 'FLISK_CHECKOUT_NAME')" in source
    assert "if _is_dotenv_name(name) and name not in _CHECKOUT_IDENTITY_NAMES:" in source


@pytest.mark.fast
def test_source_compares_the_recorded_path_before_using_an_id():
    source = UTILS_ENV.read_text()
    assert "os.path.realpath" in source
    assert "recorded_path" in source
    # The common helper stays pure: a mismatch leaves the id unset instead of persisting a new one.
    assert "write_file" not in source


@TILT_REQUIRED
@pytest.mark.generator
def test_uses_the_record_id_when_the_recorded_path_matches(project: Path):
    write_record(project, "1a2b3c4d", os.path.realpath(project))

    report = run_tilt(project)

    assert report["id"] == "1a2b3c4d"
    assert report["name"] == "checkout-env-project"


@TILT_REQUIRED
@pytest.mark.generator
def test_ignores_the_record_id_when_the_recorded_path_differs(project: Path):
    write_record(project, "1a2b3c4d", "/somewhere/else/entirely")

    report = run_tilt(project)

    # The mismatched id is not used; the supported identity flow (`flisk up`) regenerates one on the next start.
    assert report["id"] == ""
    assert report["name"] == "checkout-env-project"


@TILT_REQUIRED
@pytest.mark.generator
def test_dotenv_cannot_override_the_checkout_identity(project: Path):
    write_record(project, "1a2b3c4d", os.path.realpath(project))
    (project / ".env").write_text(
        "FLISK_CHECKOUT_ID=hijacked-id\n"
        "FLISK_CHECKOUT_NAME=hijacked-name\n"
        "ORDINARY_KEY=ordinary-value\n"
    )

    report = run_tilt(project)

    assert report["id"] == "1a2b3c4d"
    assert report["name"] == "checkout-env-project"
    # Ordinary dotenv keys keep their behavior.
    assert report["other"] == "ordinary-value"


@TILT_REQUIRED
@pytest.mark.generator
def test_dotenv_identity_values_are_skipped_even_without_a_record(project: Path):
    (project / ".env").write_text("FLISK_CHECKOUT_ID=hijacked-id\nFLISK_CHECKOUT_NAME=hijacked-name\n")

    report = run_tilt(project)

    # No exported values, no readable record: the file's identity values are dropped, not adopted.
    assert report["id"] == ""
    assert report["name"] == "checkout-env-project"
