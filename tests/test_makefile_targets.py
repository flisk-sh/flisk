# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
"""Regression checks for the contributor-facing Make test targets."""

import os
import subprocess
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


def dry_run(target: str) -> str:
    """Return the commands Make would execute for a target."""
    result = subprocess.run(
        ["make", "--dry-run", target],
        cwd=REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def test_focused_targets_use_the_expected_test_runners() -> None:
    assert "cd cli && npm test" in dry_run("test-ts")
    assert "pytest tests/ -v --tb=short" in dry_run("test-python")
    assert 'for script in scripts/verify-*.sh; do bash -n "$script" || exit 1; done' in dry_run(
        "test-shell"
    )


def test_shell_target_checks_every_verification_script(tmp_path: Path) -> None:
    expected_scripts = sorted(
        str(path.relative_to(REPOSITORY_ROOT))
        for path in (REPOSITORY_ROOT / "scripts").glob("verify-*.sh")
    )
    assert expected_scripts

    log_path = tmp_path / "checked-scripts.txt"
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_bash = fake_bin / "bash"
    fake_bash.write_text('#!/bin/sh\nprintf "%s\\n" "$2" >> "$SHELL_CHECK_LOG"\n')
    fake_bash.chmod(0o755)

    env = os.environ.copy()
    env["PATH"] = f"{fake_bin}{os.pathsep}{env['PATH']}"
    env["SHELL_CHECK_LOG"] = str(log_path)
    subprocess.run(
        ["make", "test-shell"],
        cwd=REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )

    assert log_path.read_text().splitlines() == expected_scripts


def test_shell_target_fails_when_a_verification_script_is_invalid(tmp_path: Path) -> None:
    expected_scripts = sorted(
        str(path.relative_to(REPOSITORY_ROOT))
        for path in (REPOSITORY_ROOT / "scripts").glob("verify-*.sh")
    )
    assert len(expected_scripts) >= 2, "need two verify scripts to prove the loop stops at the failure"
    failing_script = expected_scripts[1]

    log_path = tmp_path / "checked-scripts.txt"
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_bash = fake_bin / "bash"
    fake_bash.write_text(
        '#!/bin/sh\nprintf "%s\\n" "$2" >> "$SHELL_CHECK_LOG"\n'
        '[ "$2" != "$FAILING_SCRIPT" ]\n'
    )
    fake_bash.chmod(0o755)

    env = os.environ.copy()
    env["PATH"] = f"{fake_bin}{os.pathsep}{env['PATH']}"
    env["SHELL_CHECK_LOG"] = str(log_path)
    env["FAILING_SCRIPT"] = failing_script
    result = subprocess.run(
        ["make", "test-shell"],
        cwd=REPOSITORY_ROOT,
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )

    assert result.returncode != 0
    assert log_path.read_text().splitlines() == expected_scripts[:2]


def test_comprehensive_target_runs_each_focused_check() -> None:
    output = dry_run("test")

    commands = (
        "cd cli && npm test",
        "pytest tests/ -v --tb=short",
        'for script in scripts/verify-*.sh; do bash -n "$script" || exit 1; done',
    )
    positions = [output.index(command) for command in commands]

    assert positions == sorted(positions)
