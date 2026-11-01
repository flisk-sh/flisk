# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""The discovery registry cache is in-memory only; no no-op persist callback is exported."""

import re
from pathlib import Path

REGISTRY = Path(__file__).resolve().parents[2] / "runtime" / "discovery" / "registry.star"


def test_registry_has_no_noop_persist_callback():
    source = REGISTRY.read_text()
    assert "persist_cache_to_file" not in source
    assert not re.search(r"^\s*persist\s*=", source, re.MULTILINE)


def test_registry_exports_cache_operations():
    source = REGISTRY.read_text()
    for name in ("add", "remove", "has", "get_by_path", "stats"):
        assert re.search(rf"^\s*{name}\s*=", source, re.MULTILINE)
