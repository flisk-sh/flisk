# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""Dependency env keys keep the dependency's real name (#395).

_build_dependency_env_lines used to run each dependency through
_normalize_dependency_path, which stripped -backend/-frontend/
-management-backend suffixes before building the VITE_ variable name.
Two distinct dependencies (orders-api and orders-api-backend) collapsed
onto one VITE_ORDERS_API_API_URL line, and a resource that legitimately
ends in -backend was renamed in the frontend's env file. The key now
comes from the dependency name itself.
"""

from pathlib import Path

import pytest

pytestmark = [pytest.mark.fast, pytest.mark.generator]

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_STAR = (
    REPO_ROOT
    / "runtime"
    / "engine"
    / "topologies"
    / "tilt"
    / "resources"
    / "orchestrator"
    / "generators"
    / "env.star"
)


@pytest.fixture
def source() -> str:
    return ENV_STAR.read_text()


class TestDependencyEnvKeyNames:
    def test_suffix_normalizer_is_gone(self, source: str):
        assert "_normalize_dependency_path" not in source

    def test_key_comes_from_dependency_name(self, source: str):
        body = source.split("def _build_dependency_env_lines(", 1)[1]
        assert "dep_key = _dependency_env_key(dep)" in body
        assert "_dependency_env_key(dep_path)" not in body

    def test_dedup_is_by_dependency_name(self, source: str):
        body = source.split("def _build_dependency_env_lines(", 1)[1]
        assert "seen.get(dep, False)" in body
        assert "ordered.append(dep)" in body
