# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""Property-based tests for service manifest validation in discovery (#3306).

Global Day of Coderetreat 2026 exercise:
Generate random service.json files using Hypothesis and verify that:
1. Valid manifests always pass validation with zero issues.
2. Invalid manifests always fail with clear, actionable diagnostics.
3. Boundary values (appName length, port ranges, replica counts) are strictly enforced.
4. Validation is robust and never crashes on arbitrary JSON structures.
5. Python validation logic mirrors discovery Starlark validation rules.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

import pytest
from hypothesis import given, settings, strategies as st

REPO_ROOT = Path(__file__).resolve().parents[2]

VALID_APP_TYPES = [
    "backend",
    "frontend",
    "library",
    "migrator",
    "sdk",
    "worker",
    "database",
    "bring-your-own",
]

PORT_RANGES = {
    "frontend": {"min": 3000, "max": 5999},
    "backend": {"min": 4000, "max": 5999},
    "worker": {"min": 4000, "max": 6999},
    "migrator": {"min": 7000, "max": 7999},
    "sdk": {"min": 3000, "max": 9999},
    "library": {"min": 3000, "max": 9999},
}

VALID_RESOURCE_FEATURES = [
    "api-client",
    "env-config",
    "api-index",
    "prisma",
    "nats",
    "redis",
    "infisical",
    "vitest",
    "traefik",
    "websocket",
    "graphql",
    "grpc",
    "vite-node",
    "maintenance",
    "ddd",
]

KEBAB_CASE_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def validate_manifest(manifest: dict[str, Any], *, valid_stacks: list[str] | None = None) -> list[str]:
    """Validate service manifest structure and values according to discovery rules.

    Matches runtime/discovery/manifest/validation.star and validation.star.
    """
    issues: list[str] = []

    # 1. Required field: appName
    app_name = manifest.get("appName")
    if not app_name:
        issues.append("Missing required field: appName")
    elif not isinstance(app_name, str):
        issues.append("appName must be a string")
    else:
        if len(app_name) < 2:
            issues.append(f"appName too short: '{app_name}'. Minimum 2 characters")
        elif len(app_name) > 64:
            issues.append(f"appName too long: '{app_name}'. Maximum 64 characters")

        for char in app_name:
            if not (char.islower() or char.isdigit() or char == "-"):
                issues.append(
                    f"Invalid character in appName: '{char}'. Must be kebab-case (lowercase, numbers, hyphens)"
                )
                break
        if app_name.startswith("-") or app_name.endswith("-"):
            issues.append("appName cannot start or end with a hyphen")

    # 2. Required field: appType
    app_type = manifest.get("appType")
    if not app_type:
        issues.append("Missing required field: appType")
    elif app_type not in VALID_APP_TYPES:
        issues.append(
            f"Invalid appType: {app_type}. Must be one of: {', '.join(VALID_APP_TYPES)}"
        )

    # 3. Required field: stack
    stack = manifest.get("stack")
    if not stack:
        issues.append("Missing required field: stack")
    elif valid_stacks and stack not in valid_stacks:
        issues.append(f"Invalid stack: {stack}. Must be one of: {', '.join(valid_stacks)}")

    # 4. Port validation
    port = manifest.get("port")
    if port is None:
        if app_type not in ["infra", "database"]:
            issues.append("Missing required field: port")
    elif not isinstance(port, int) or isinstance(port, bool):
        issues.append(f"Invalid port: {port}. Must be an integer")
    elif app_type == "bring-your-own":
        if port < 1 or port > 65535:
            issues.append(f"Invalid port: {port}. Must be integer 1-65535")
    elif app_type != "infra" and app_type != "database":
        if port < 3000 or port > 9999:
            issues.append(f"Invalid port: {port}. Must be integer 3000-9999")
        elif app_type in PORT_RANGES:
            port_range = PORT_RANGES[app_type]
            if port < port_range["min"] or port > port_range["max"]:
                issues.append(
                    f"Port {port} out of range for {app_type}. Expected {port_range['min']}-{port_range['max']}"
                )

    # 5. Features validation
    if "featuresEnabled" in manifest:
        features = manifest["featuresEnabled"]
        if not isinstance(features, list):
            issues.append("Invalid features: must be an array")
        else:
            for feat in features:
                if feat not in VALID_RESOURCE_FEATURES:
                    issues.append(
                        f"Invalid feature: {feat}. Must be one of: {', '.join(VALID_RESOURCE_FEATURES)}"
                    )

    # 6. dependsOn validation
    if "dependsOn" in manifest:
        deps = manifest["dependsOn"]
        if not isinstance(deps, list):
            issues.append("Invalid dependsOn: must be an array")

    # 7. Replicas validation
    if "replicas" in manifest and manifest["replicas"] is not None:
        replicas = manifest["replicas"]
        if not isinstance(replicas, int) or isinstance(replicas, bool):
            issues.append("Invalid replicas: must be an integer")
        elif replicas < 1:
            issues.append(f"Invalid replicas: {replicas}. Minimum is 1")
        elif replicas > 10:
            issues.append(f"Invalid replicas: {replicas}. Maximum is 10")

    return issues


# =============================================================================
# Hypothesis Strategies
# =============================================================================

st_kebab_token = st.from_regex(r"[a-z0-9]{1,8}", fullmatch=True)

st_valid_app_names = st.lists(st_kebab_token, min_size=1, max_size=5).map(lambda parts: "-".join(parts)).filter(
    lambda s: 2 <= len(s) <= 64 and not s.startswith("-") and not s.endswith("-")
)

st_valid_stacks = st.lists(st_kebab_token, min_size=1, max_size=3).map(lambda parts: "-".join(parts)).filter(
    lambda s: len(s) >= 2
)

st_valid_standard_app_types = st.sampled_from([
    t for t in VALID_APP_TYPES if t not in ["database", "bring-your-own"]
])


@st.composite
def st_valid_standard_manifests(draw):
    """Generate valid standard service manifests with appropriate type-specific port ranges."""
    app_type = draw(st_valid_standard_app_types)
    port_range = PORT_RANGES[app_type]
    port = draw(st.integers(min_value=port_range["min"], max_value=port_range["max"]))
    app_name = draw(st_valid_app_names)
    stack = draw(st_valid_stacks)

    manifest: dict[str, Any] = {
        "appName": app_name,
        "appType": app_type,
        "stack": stack,
        "port": port,
    }

    if draw(st.booleans()):
        features = draw(st.lists(st.sampled_from(VALID_RESOURCE_FEATURES), unique=True, max_size=4))
        manifest["featuresEnabled"] = features

    if draw(st.booleans()):
        deps = draw(st.lists(st_valid_app_names, unique=True, max_size=3))
        manifest["dependsOn"] = deps

    if draw(st.booleans()):
        replicas = draw(st.integers(min_value=1, max_value=10))
        manifest["replicas"] = replicas

    return manifest


@st.composite
def st_valid_byo_manifests(draw):
    """Generate valid bring-your-own manifests with 1-65535 port range."""
    app_name = draw(st_valid_app_names)
    stack = draw(st_valid_stacks)
    port = draw(st.integers(min_value=1, max_value=65535))
    return {
        "appName": app_name,
        "appType": "bring-your-own",
        "stack": stack,
        "port": port,
    }


@st.composite
def st_valid_database_manifests(draw):
    """Generate valid database resource manifests (port is omitted)."""
    app_name = draw(st_valid_app_names)
    stack = draw(st_valid_stacks)
    manifest = {
        "appName": app_name,
        "appType": "database",
        "stack": stack,
    }
    if draw(st.booleans()):
        manifest["framework"] = "postgres"
    return manifest


# =============================================================================
# Property Tests
# =============================================================================


class TestManifestValidationProperties:
    """Property-based verification of service manifest validation rules."""

    @settings(max_examples=100)
    @given(st_valid_standard_manifests())
    def test_valid_standard_manifests_always_pass(self, manifest: dict[str, Any]):
        """Property: Any conformant standard service manifest produces zero issues."""
        issues = validate_manifest(manifest)
        assert issues == [], f"Expected valid manifest to pass, got: {issues}"

    @settings(max_examples=50)
    @given(st_valid_byo_manifests())
    def test_valid_byo_manifests_always_pass(self, manifest: dict[str, Any]):
        """Property: Bring-your-own services accept container ports from 1 to 65535."""
        issues = validate_manifest(manifest)
        assert issues == [], f"Expected BYO manifest to pass, got: {issues}"

    @settings(max_examples=50)
    @given(st_valid_database_manifests())
    def test_valid_database_manifests_pass_without_port(self, manifest: dict[str, Any]):
        """Property: Database resources declare platform Postgres and do not require a port."""
        issues = validate_manifest(manifest)
        assert issues == [], f"Expected database manifest to pass, got: {issues}"

    @settings(max_examples=50)
    @given(
        st_valid_standard_manifests(),
        st.sampled_from(["appName", "appType", "stack", "port"]),
    )
    def test_missing_required_fields_always_reported(
        self, manifest: dict[str, Any], missing_field: str
    ):
        """Property: Removing any required field produces a clear 'Missing required field' diagnostic."""
        corrupted = dict(manifest)
        del corrupted[missing_field]
        issues = validate_manifest(corrupted)
        assert any(
            f"Missing required field: {missing_field}" in issue for issue in issues
        ), f"Missing {missing_field} was not detected. Issues: {issues}"

    @settings(max_examples=50)
    @given(
        st.text(min_size=0, max_size=1),
        st_valid_standard_app_types,
        st_valid_stacks,
    )
    def test_short_app_name_rejected(self, short_name: str, app_type: str, stack: str):
        """Property: appName under 2 characters is rejected with clear minimum diagnostic."""
        manifest = {
            "appName": short_name,
            "appType": app_type,
            "stack": stack,
            "port": PORT_RANGES[app_type]["min"],
        }
        issues = validate_manifest(manifest)
        assert any(
            "appName too short" in issue or "Missing required field: appName" in issue
            for issue in issues
        )

    @settings(max_examples=50)
    @given(
        st.from_regex(r"[a-z0-9]{65,120}", fullmatch=True),
        st_valid_standard_app_types,
        st_valid_stacks,
    )
    def test_long_app_name_rejected(self, long_name: str, app_type: str, stack: str):
        """Property: appName exceeding 64 characters is rejected with maximum diagnostic."""
        manifest = {
            "appName": long_name,
            "appType": app_type,
            "stack": stack,
            "port": PORT_RANGES[app_type]["min"],
        }
        issues = validate_manifest(manifest)
        assert any("appName too long" in issue for issue in issues)

    @settings(max_examples=50)
    @given(
        st_valid_app_names,
        st.sampled_from(["-prefix", "suffix-", "-both-"]),
        st_valid_standard_app_types,
        st_valid_stacks,
    )
    def test_app_name_hyphen_boundaries_rejected(
        self, base_name: str, variant: str, app_type: str, stack: str
    ):
        """Property: appName with leading or trailing hyphens is rejected."""
        if variant == "-prefix":
            bad_name = f"-{base_name}"
        elif variant == "suffix-":
            bad_name = f"{base_name}-"
        else:
            bad_name = f"-{base_name}-"

        manifest = {
            "appName": bad_name,
            "appType": app_type,
            "stack": stack,
            "port": PORT_RANGES[app_type]["min"],
        }
        issues = validate_manifest(manifest)
        assert any("cannot start or end with a hyphen" in issue for issue in issues)

    @settings(max_examples=50)
    @given(
        st_valid_app_names,
        st.text(
            alphabet=st.characters(
                categories=["Lu", "P", "S", "Z"],
                exclude_characters=["-"],
            ),
            min_size=1,
            max_size=3,
        ),
        st_valid_standard_app_types,
        st_valid_stacks,
    )
    def test_non_kebab_app_name_rejected(
        self, base_name: str, invalid_chars: str, app_type: str, stack: str
    ):
        """Property: appName with uppercase or invalid symbols is rejected."""
        bad_name = f"{base_name[:len(base_name)//2]}{invalid_chars}{base_name[len(base_name)//2:]}"
        manifest = {
            "appName": bad_name,
            "appType": app_type,
            "stack": stack,
            "port": PORT_RANGES[app_type]["min"],
        }
        issues = validate_manifest(manifest)
        assert any("Invalid character in appName" in issue or "cannot start or end with a hyphen" in issue for issue in issues)

    @settings(max_examples=50)
    @given(
        st_valid_standard_manifests(),
        st.text(min_size=1, max_size=20).filter(lambda s: s not in VALID_APP_TYPES),
    )
    def test_unknown_app_type_rejected(self, manifest: dict[str, Any], bad_type: str):
        """Property: Unknown appType values are rejected with allowed choices listed."""
        corrupted = dict(manifest, appType=bad_type)
        issues = validate_manifest(corrupted)
        assert any(f"Invalid appType: {bad_type}" in issue for issue in issues)

    @settings(max_examples=50)
    @given(
        st_valid_standard_manifests(),
        st.one_of(
            st.integers(max_value=2999),
            st.integers(min_value=10000, max_value=65535),
        ),
    )
    def test_out_of_range_standard_ports_rejected(
        self, manifest: dict[str, Any], bad_port: int
    ):
        """Property: Standard service ports outside 3000-9999 are rejected."""
        corrupted = dict(manifest, port=bad_port)
        issues = validate_manifest(corrupted)
        assert any("out of range" in issue or "3000-9999" in issue for issue in issues)

    @settings(max_examples=50)
    @given(
        st_valid_byo_manifests(),
        st.one_of(
            st.integers(max_value=0),
            st.integers(min_value=65536, max_value=100000),
        ),
    )
    def test_out_of_range_byo_ports_rejected(
        self, manifest: dict[str, Any], bad_port: int
    ):
        """Property: BYO ports outside 1-65535 are rejected."""
        corrupted = dict(manifest, port=bad_port)
        issues = validate_manifest(corrupted)
        assert any("1-65535" in issue for issue in issues)

    @settings(max_examples=50)
    @given(
        st_valid_standard_manifests(),
        st.one_of(
            st.text(min_size=1, max_size=5),
            st.floats(min_value=3000.0, max_value=9999.0),
            st.booleans(),
        ),
    )
    def test_non_integer_port_rejected(self, manifest: dict[str, Any], bad_port: Any):
        """Property: Non-integer ports are rejected with type diagnostic."""
        corrupted = dict(manifest, port=bad_port)
        issues = validate_manifest(corrupted)
        assert any("Must be an integer" in issue for issue in issues)

    @settings(max_examples=50)
    @given(
        st_valid_standard_manifests(),
        st.one_of(
            st.integers(max_value=0),
            st.integers(min_value=11, max_value=100),
            st.text(min_size=1, max_size=4),
            st.booleans(),
        ),
    )
    def test_invalid_replicas_rejected(self, manifest: dict[str, Any], bad_replicas: Any):
        """Property: Replicas outside 1-10 or of wrong type are rejected."""
        corrupted = dict(manifest, replicas=bad_replicas)
        issues = validate_manifest(corrupted)
        assert any("Invalid replicas" in issue for issue in issues)

    @settings(max_examples=50)
    @given(
        st_valid_standard_manifests(),
        st.text(min_size=1, max_size=20).filter(lambda s: s not in VALID_RESOURCE_FEATURES),
    )
    def test_unknown_feature_flags_rejected(
        self, manifest: dict[str, Any], bad_feature: str
    ):
        """Property: Unknown feature flags are rejected."""
        corrupted = dict(manifest, featuresEnabled=[bad_feature])
        issues = validate_manifest(corrupted)
        assert any(f"Invalid feature: {bad_feature}" in issue for issue in issues)

    @settings(max_examples=100)
    @given(
        st.dictionaries(
            keys=st.text(max_size=20),
            values=st.recursive(
                st.none() | st.booleans() | st.integers() | st.text(max_size=30),
                lambda children: st.lists(children, max_size=3) | st.dictionaries(st.text(max_size=10), children, max_size=3),
                max_leaves=10,
            ),
            max_size=8,
        )
    )
    def test_arbitrary_json_never_crashes_validator(self, random_dict: dict[str, Any]):
        """Property: The validator never throws an unhandled exception on arbitrary input."""
        issues = validate_manifest(random_dict)
        assert isinstance(issues, list)
        for issue in issues:
            assert isinstance(issue, str)


# =============================================================================
# Starlark Parity Test (Executed via Tilt when Tilt CLI is available)
# =============================================================================

STARLARK_TEST_BODY = """
load('@DISCOVERY/validation.star', 'validate')
load('@DISCOVERY/manifest/constants.star', 'VALID_APP_TYPES')

def run_tests():
    samples = [
        # 1. Valid backend
        {'appName': 'orders-backend', 'appType': 'backend', 'stack': 'shop', 'port': 4001},
        # 2. Valid BYO port 80
        {'appName': 'web-proxy', 'appType': 'bring-your-own', 'stack': 'edge', 'port': 80},
        # 3. Missing appName
        {'appType': 'backend', 'stack': 'shop', 'port': 4001},
        # 4. Bad port
        {'appName': 'bad-port', 'appType': 'backend', 'stack': 'shop', 'port': 80},
        # 5. Bad appType
        {'appName': 'bad-type', 'appType': 'unknown', 'stack': 'shop', 'port': 4001},
        # 6. Bad replicas
        {'appName': 'bad-rep', 'appType': 'backend', 'stack': 'shop', 'port': 4001, 'replicas': 99},
    ]
    results = []
    for s in samples:
        results.append(validate(s))
    return results

fail('RESULT' + encode_json(run_tests()))
"""


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_starlark_discovery_validation_parity(tmp_path: Path):
    """Verify parity between Python validation and runtime/discovery/validation.star."""
    samples = [
        {"appName": "orders-backend", "appType": "backend", "stack": "shop", "port": 4001},
        {"appName": "web-proxy", "appType": "bring-your-own", "stack": "edge", "port": 80},
        {"appType": "backend", "stack": "shop", "port": 4001},
        {"appName": "bad-port", "appType": "backend", "stack": "shop", "port": 80},
        {"appName": "bad-type", "appType": "unknown", "stack": "shop", "port": 4001},
        {"appName": "bad-rep", "appType": "backend", "stack": "shop", "port": 4001, "replicas": 99},
    ]

    # Evaluate via Tilt
    project_root = tmp_path / "project"
    project_root.mkdir()
    (project_root / ".flisk").mkdir()
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "test"}}))
    tiltfile = project_root / "Tiltfile"
    tiltfile.write_text(
        STARLARK_TEST_BODY.replace("@DISCOVERY", str(REPO_ROOT / "runtime" / "discovery"))
    )

    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=30,
        cwd=project_root,
        env={**os.environ, "FLISK_PROJECT_ROOT": str(project_root)},
    )
    output = proc.stdout + proc.stderr
    assert "Error in fail: RESULT" in output, output[-2000:]
    starlark_results = json.loads(output.split("Error in fail: RESULT", 1)[1].strip())

    # Compare with Python validator
    for idx, sample in enumerate(samples):
        py_issues = validate_manifest(sample)
        star_issues = starlark_results[idx]
        has_py_issues = len(py_issues) > 0
        has_star_issues = len(star_issues) > 0
        assert has_py_issues == has_star_issues, (
            f"Sample {idx} disagreement: Python issues={py_issues}, Starlark issues={star_issues}"
        )
