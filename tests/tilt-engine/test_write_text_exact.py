# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
write_text_exact (runtime/discovery/native_windows.star) writes generated files through `sh -c`, with the content as an
argument. Linux refuses any single argument over 128 KiB, so a 300-resource project failed its generated compose file with
"argument list too long". These tests run the real Starlark through Tilt's interpreter with content over that limit.
"""

from __future__ import annotations

import os
import stat

import pytest

from test_dependson_platform_postgres import REPO_ROOT, TILT_REQUIRED, run_starlark

pytestmark = [pytest.mark.generator]

NATIVE_WINDOWS = REPO_ROOT / "runtime" / "discovery" / "native_windows.star"

# Above Linux's 128 KiB per-argument limit, with multi-byte characters so a cut in the middle of one would show.
LINES = 4000
LINE = "line {i:05d} 🛑 {pad}\n"
PAD = "x" * 60


def _body(target_dir, cases: dict[str, str]) -> str:
    load = f"load({str(NATIVE_WINDOWS)!r}, 'write_text_exact')\n"
    writes = "".join(
        f"write_text_exact({str(target_dir)!r}, {str(target_dir / name)!r}, {content!r})\n" for name, content in cases.items()
    )
    return load + writes + "r = {'written': True}\n"


@TILT_REQUIRED
def test_content_over_the_linux_argument_limit_is_written_byte_for_byte(tmp_path):
    big = "".join(LINE.format(i=i, pad=PAD) for i in range(LINES))
    assert len(big.encode("utf-8")) > 128 * 1024
    target = tmp_path / "services"
    run_starlark(tmp_path, _body(target, {"big.txt": big}))
    assert (target / "big.txt").read_bytes() == big.encode("utf-8")


@TILT_REQUIRED
def test_dense_four_byte_characters_are_written_byte_for_byte(tmp_path):
    # Every character is 4 bytes, so a piece sized by characters instead of bytes would be 4x over budget.
    dense = "".join("🛑" * 500 + "\n" for _ in range(100))
    assert len(dense.encode("utf-8")) > 128 * 1024
    target = tmp_path / "services"
    run_starlark(tmp_path, _body(target, {"dense.txt": dense}))
    assert (target / "dense.txt").read_bytes() == dense.encode("utf-8")


@TILT_REQUIRED
def test_one_line_over_the_linux_argument_limit_is_written_byte_for_byte(tmp_path):
    # No newline to cut at: the line itself must be split, between characters and never inside one.
    long_line = "a🛑é" * 30000 + "\nshort tail"
    assert len(long_line.split("\n")[0].encode("utf-8")) > 128 * 1024
    target = tmp_path / "services"
    run_starlark(tmp_path, _body(target, {"long-line.txt": long_line}))
    assert (target / "long-line.txt").read_bytes() == long_line.encode("utf-8")


@TILT_REQUIRED
def test_one_ascii_line_over_the_linux_argument_limit_is_written_byte_for_byte(tmp_path):
    ascii_line = "x" * (200 * 1024)
    target = tmp_path / "services"
    run_starlark(tmp_path, _body(target, {"ascii-line.txt": ascii_line}))
    assert (target / "ascii-line.txt").read_bytes() == ascii_line.encode("utf-8")


@TILT_REQUIRED
def test_a_character_straddling_a_piece_boundary_is_not_cut(tmp_path):
    # WRITE_PIECE_BYTES is 32768: 32767 ASCII bytes leave room for one byte, so the 4-byte emoji must start the next piece.
    straddle = ("x" * 32767 + "🛑") * 5
    target = tmp_path / "services"
    run_starlark(tmp_path, _body(target, {"straddle.txt": straddle}))
    assert (target / "straddle.txt").read_bytes() == straddle.encode("utf-8")


@TILT_REQUIRED
def test_a_multi_piece_write_replaces_the_file_and_leaves_no_temporary_file(tmp_path):
    # The pieces are built in a temporary file and renamed into place; an older, longer file must not leave a tail behind.
    target = tmp_path / "services"
    target.mkdir()
    (target / "compose.yaml").write_bytes(b"old " * 100_000)
    big = "".join(LINE.format(i=i, pad=PAD) for i in range(LINES))
    run_starlark(tmp_path, _body(target, {"compose.yaml": big}))
    assert (target / "compose.yaml").read_bytes() == big.encode("utf-8")
    assert sorted(p.name for p in target.iterdir()) == ["compose.yaml"]


@TILT_REQUIRED
def test_written_files_keep_the_mode_a_plain_write_gives(tmp_path):
    # Writes go through mktemp, which creates files 0600; the rename must not leave generated files unreadable to others.
    umask = os.umask(0)
    os.umask(umask)
    target = tmp_path / "services"
    big = "".join(LINE.format(i=i, pad=PAD) for i in range(LINES))
    run_starlark(tmp_path, _body(target, {"small.yaml": "a: 1\n", "big.yaml": big}))
    for name in ("small.yaml", "big.yaml"):
        assert stat.S_IMODE((target / name).stat().st_mode) == 0o666 & ~umask, name
    assert sorted(p.name for p in target.iterdir()) == ["big.yaml", "small.yaml"]


@TILT_REQUIRED
def test_small_and_empty_content_is_written_exactly(tmp_path):
    target = tmp_path / "services"
    run_starlark(tmp_path, _body(target, {"small.txt": "hi 🛑\n", "no-newline.txt": "no newline", "empty.txt": ""}))
    assert (target / "small.txt").read_bytes() == "hi 🛑\n".encode("utf-8")
    assert (target / "no-newline.txt").read_bytes() == b"no newline"
    assert (target / "empty.txt").read_bytes() == b""
