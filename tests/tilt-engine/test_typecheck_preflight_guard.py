# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Regression test for the frontend typecheck preflight guard.

The `<service>-typecheck` local_resource runs `bunx tsc --noEmit` on the host. The guard
used to check only that `bunx tsc --version` works, which succeeds without any installed
dependencies, so a checkout without `bun install` failed later with a bare
"Cannot find type definition file for 'vite/client'". The guard now also requires
`node_modules/vite/package.json` in the service directory and fails with the
"run bun install" instruction when it is missing.
"""

import re
import stat
import subprocess
from pathlib import Path

import pytest

pytestmark = [pytest.mark.fast, pytest.mark.generator]

REPO_ROOT = Path(__file__).parent.parent.parent
REGISTRATION = (
    REPO_ROOT
    / "runtime"
    / "engine"
    / "topologies"
    / "tilt"
    / "resources"
    / "orchestrator"
    / "apply_compose_resource_registration.star"
)


def _guard_script() -> str:
    source = REGISTRATION.read_text()
    match = re.search(r"'(cd \"\$1\" && \{ bunx tsc --version.*?)',\n", source)
    assert match, "typecheck guard command not found in apply_compose_resource_registration.star"
    return match.group(1)


@pytest.fixture
def fake_bunx(tmp_path: Path) -> Path:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    bunx = bin_dir / "bunx"
    bunx.write_text("#!/bin/sh\nexit 0\n")
    bunx.chmod(bunx.stat().st_mode | stat.S_IEXEC)
    return bin_dir


def _run_guard(service_dir: Path, bin_dir: Path) -> subprocess.CompletedProcess:
    env = {"PATH": f"{bin_dir}:/usr/bin:/bin"}
    return subprocess.run(
        ["sh", "-c", _guard_script(), "sh", str(service_dir), "echo typechecked"],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )


def test_guard_fails_with_install_hint_when_vite_is_missing(tmp_path: Path, fake_bunx: Path) -> None:
    service_dir = tmp_path / "floor-app"
    service_dir.mkdir()

    result = _run_guard(service_dir, fake_bunx)

    assert result.returncode != 0
    assert f"typecheck needs host dependencies: run bun install in {service_dir}" in result.stdout
    assert "typechecked" not in result.stdout


def test_guard_runs_typecheck_when_vite_is_installed(tmp_path: Path, fake_bunx: Path) -> None:
    service_dir = tmp_path / "floor-app"
    (service_dir / "node_modules" / "vite").mkdir(parents=True)
    (service_dir / "node_modules" / "vite" / "package.json").write_text("{}")

    result = _run_guard(service_dir, fake_bunx)

    assert result.returncode == 0, result.stdout + result.stderr
    assert "typechecked" in result.stdout
