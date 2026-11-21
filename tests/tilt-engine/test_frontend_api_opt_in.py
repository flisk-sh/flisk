# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""Opt-in frontend API files (#2236).

docs/FEATURES.md says a feature is disabled by removing it from the
manifest's features list, but generate_all_frontend_api_files used to
emit api-client.ts, env.ts and api-index.ts unconditionally. These
tests pin the gate: a featuresEnabled list generates only the files it
names, a manifest without the field keeps all three (pre-gate
behaviour for manifests written before the field existed), and the
api-index barrel never re-exports a file that was not generated.
"""

from pathlib import Path

import pytest

pytestmark = [pytest.mark.fast, pytest.mark.generator]

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_STAR = (
    REPO_ROOT
    / "runtime"
    / "engine"
    / "topologies"
    / "tilt"
    / "resources"
    / "orchestrator"
    / "generators"
    / "frontend.star"
)


@pytest.fixture
def source() -> str:
    return FRONTEND_STAR.read_text()


def _generate_all_body(source: str) -> str:
    return source.split("def generate_all_frontend_api_files(", 1)[1]


class TestFrontendApiOptInGate:
    def test_gate_reads_features_enabled(self, source: str):
        body = _generate_all_body(source)
        assert "manifest.get('featuresEnabled')" in body

    def test_missing_field_keeps_all_three_defaults(self, source: str):
        body = _generate_all_body(source)
        assert "features == None" in body
        assert (
            "FRONTEND_API_DEFAULT_FEATURES = ['api-client', 'env-config', 'api-index']"
            in source
        )

    @pytest.mark.parametrize(
        "feature,generated",
        [
            ("api-client", "api-client.ts"),
            ("env-config", "env.ts"),
            ("api-index", "api-index.ts"),
        ],
    )
    def test_each_file_is_gated_on_its_feature(self, source: str, feature, generated):
        body = _generate_all_body(source)
        assert f"'{feature}' in features" in body
        assert f"'{generated}'" in body


class TestApiIndexBarrel:
    def test_barrel_exports_are_conditional(self, source: str):
        body = source.split("def generate_frontend_api_index(", 1)[1].split(
            "def ", 1
        )[0]
        assert "if api_client:" in body
        assert "if env_config:" in body

    def test_generate_all_passes_source_state_to_barrel(self, source: str):
        body = _generate_all_body(source)
        assert "api_client='api-client' in features" in body
        assert "env_config='env-config' in features" in body
