# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
`file_exists` and `dir_exists` answer `test -f` / `test -d` with a shell command (10-15 ms each). A project load asked
72 times in the shop benchmark, 38 of them for files that do not exist, such as a project without a `.env` (flisk#4237).
Tilt's own `os.path.exists` answers "missing" in microseconds and adds no file watch, so a missing path must not run a
shell command. A path that exists still goes to the shell, which tells a file from a directory.

Executes the real Starlark through Tilt's interpreter (`tilt alpha tiltfile-result -b`, which lists every builtin call).
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from test_compose_project_scoping import TILT_REQUIRED

pytestmark = [pytest.mark.generator]

NATIVE = Path(__file__).resolve().parents[2] / "runtime/discovery/native_windows.star"

BODY = """
load('{native}', 'file_exists', 'dir_exists')
r = [
    file_exists('missing.env'),
    file_exists('missing.yml', cwd='{root}'),
    dir_exists('missing-dir'),
    file_exists('present.env'),
    file_exists('a-dir'),
    dir_exists('a-dir'),
    dir_exists('present.env'),
]
{finish}
"""


def load(tmp_path: Path, finish: str, *flags: str) -> str:
    (tmp_path / "Tiltfile").write_text(BODY.format(native=NATIVE, root=tmp_path, finish=finish))
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", *flags, "-f", str(tmp_path / "Tiltfile")],
        capture_output=True,
        text=True,
        timeout=180,
        cwd=tmp_path,
    )
    return proc.stdout + proc.stderr


@TILT_REQUIRED
def test_a_missing_path_is_answered_without_a_shell_command(tmp_path):
    (tmp_path / "present.env").write_text("A=1\n")
    (tmp_path / "a-dir").mkdir()
    output = load(tmp_path, "fail('RESULT ' + str(r))")
    assert "RESULT [False, False, False, True, False, True, False]" in output, output[-3000:]

    # A load that fails prints no builtin timings, so the timings come from a load that succeeds.
    output = load(tmp_path, "", "-b")
    shell_checks = [line for line in output.splitlines() if line.startswith("- local(") and "test -" in line]
    assert not any("missing" in line for line in shell_checks), "\n".join(shell_checks)
    assert len(shell_checks) == 4, "\n".join(shell_checks)
