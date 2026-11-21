# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""The engine suite skips cleanly on interpreters older than the documented minimum (#4304)."""

from pathlib import Path

import pytest

from conftest import (
    MIN_TEST_PYTHON,
    asyncio_plugin_missing,
    pytest_ignore_collect,
    unsupported_python,
)


def test_minimum_matches_the_documented_python_version():
    assert MIN_TEST_PYTHON == (3, 10)
    assert unsupported_python((3, 9)) is True
    assert unsupported_python((3, 10)) is False
    assert unsupported_python((3, 12, 10)) is False


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("test_code_executor.py", True),
        ("test_manifest_properties.py", True),
        ("conftest.py", False),
    ],
)
def test_older_interpreters_ignore_test_modules_but_not_conftest(monkeypatch, name, expected):
    monkeypatch.setattr("conftest.sys.version_info", (3, 9, 0))
    assert pytest_ignore_collect(Path("/work/tests/tilt-engine") / name, None) is expected


def test_supported_interpreters_collect_everything(monkeypatch):
    monkeypatch.setattr("conftest.sys.version_info", (3, 10, 0))
    assert pytest_ignore_collect(Path("/work/tests/tilt-engine/test_code_executor.py"), None) is False


def test_async_plugin_is_required_even_on_a_supported_interpreter():
    assert asyncio_plugin_missing(lambda name: None) is True
    assert asyncio_plugin_missing(lambda name: object() if name == "pytest_asyncio" else None) is False
