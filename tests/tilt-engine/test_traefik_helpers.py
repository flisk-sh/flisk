# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""Direct tests for the Traefik Starlark helper functions."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = [
    pytest.mark.generator,
    pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed"),
]

REPO_ROOT = Path(__file__).resolve().parents[2]
NETWORKING_DIR = (
    REPO_ROOT
    / "runtime"
    / "engine"
    / "topologies"
    / "platform"
    / "docker"
    / "networking"
)
RESULT_MARKER = "Error in fail: RESULT"


def _run_starlark(tmp_path: Path, body: str) -> dict:
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(
        body.replace("@NETWORKING", str(NETWORKING_DIR))
        + "\nfail('RESULT' + encode_json(r))\n"
    )
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=180,
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


def test_backend_rule_uses_default_api_prefix(tmp_path):
    result = _run_starlark(
        tmp_path,
        """
load('@NETWORKING/traefik_helpers.star', 'backend_rule')
r = {'rule': backend_rule('orders.backend.testproj.local', '/api/orders-management')}
""",
    )

    assert result["rule"] == (
        "Host(`orders.backend.testproj.local`) || "
        "PathPrefix(`/api/orders-management`)"
    )


def test_backend_rule_uses_custom_api_prefix(tmp_path):
    result = _run_starlark(
        tmp_path,
        """
load('@NETWORKING/traefik_helpers.star', 'backend_rule')
r = {'rule': backend_rule('orders.backend.testproj.local', '/internal/orders')}
""",
    )

    assert result["rule"] == (
        "Host(`orders.backend.testproj.local`) || " "PathPrefix(`/internal/orders`)"
    )


def run_project_rule(tmp_path: Path, project_name: str, body: str) -> dict:
    """Evaluate Starlark snippet `body` with a simulated Flisk project named `project_name`."""
    project_root = tmp_path / project_name
    (project_root / ".flisk").mkdir(parents=True, exist_ok=True)
    (project_root / ".flisk" / "project.json").write_text(
        json.dumps({"project": {"name": project_name}})
    )
    tiltfile = project_root / "Tiltfile"
    tiltfile.write_text(
        body.replace("@NETWORKING", str(NETWORKING_DIR))
        + "\nfail('RESULT' + encode_json(r))\n"
    )
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=180,
        cwd=project_root,
        env={**os.environ, "FLISK_PROJECT_ROOT": str(project_root)},
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@pytest.mark.parametrize(
    ("project_name", "manifest", "expected_rule"),
    [
        (
            "my-dashed-project",
            {"appName": "orders-api", "stack": "orders"},
            "Host(`api.my-dashed-project.localhost`) && PathPrefix(`/api/orders`)",
        ),
        (
            "ecommerce-web-portal",
            {"appName": "inventory-api", "stack": "inventory"},
            "Host(`api.ecommerce-web-portal.localhost`) && PathPrefix(`/api/inventory`)",
        ),
        (
            "multi-part-project-name",
            {"appName": "auth-api", "stack": "auth"},
            "Host(`api.multi-part-project-name.localhost`) && PathPrefix(`/api/auth`)",
        ),
    ],
)
def test_project_backend_rule_project_name_with_dashes(
    tmp_path: Path,
    project_name: str,
    manifest: dict,
    expected_rule: str,
):
    """Assert generated rule correctly preserves dashes in project name and strips -api."""
    starlark_body = f"""
load("@NETWORKING/traefik_helpers.star", "project_backend_rule")

r = {{
    "rule": project_backend_rule({manifest!r})
}}
"""
    result = run_project_rule(tmp_path, project_name, starlark_body)
    generated_rule = result["rule"]

    # Exact rule assertion
    assert generated_rule == expected_rule

    # Structural assertions on rule components
    expected_host = f"api.{project_name}.localhost"
    assert f"Host(`{expected_host}`)" in generated_rule
    assert "_" not in expected_host, "Domain host must preserve hyphens rather than converting to underscores"
    assert " && " in generated_rule


def test_project_backend_rule_single_service_project(tmp_path: Path):
    """Assert generated rules for a single-service project topology."""
    project_name = "single-service-app"
    starlark_body = """
load("@NETWORKING/traefik_helpers.star", "project_backend_rule")

r = {
    # 1. Single service named 'api' (common minimal backend)
    "api_service": project_backend_rule({"appName": "api", "stack": "api"}),
    # 2. Single service named 'backend-api' (-api stripped to /api/backend)
    "backend_api_service": project_backend_rule({"appName": "backend-api", "stack": "backend"}),
    # 3. Single service with runtime resource_name provided
    "explicit_resource": project_backend_rule(
        {"appName": "auth-api", "stack": "auth"},
        "auth-api-backend",
    ),
    # 4. Single service with custom apiPath in manifest
    "custom_api_path": project_backend_rule({
        "appName": "monolith",
        "stack": "monolith",
        "apiPath": "/api/v1/core",
    }),
}
"""
    result = run_project_rule(tmp_path, project_name, starlark_body)

    expected_host = f"api.{project_name}.localhost"

    # Single service named 'api': path is /api/api (does not end with -api)
    assert result["api_service"] == f"Host(`{expected_host}`) && PathPrefix(`/api/api`)"

    # Single service named 'backend-api': trailing -api is stripped -> /api/backend
    assert result["backend_api_service"] == f"Host(`{expected_host}`) && PathPrefix(`/api/backend`)"

    # Single service with explicit resource name: resource name takes precedence
    assert (
        result["explicit_resource"]
        == f"Host(`{expected_host}`) && PathPrefix(`/api/auth-api-backend`)"
    )

    # Custom apiPath takes precedence over default path derivation
    assert (
        result["custom_api_path"]
        == f"Host(`{expected_host}`) && PathPrefix(`/api/v1/core`)"
    )


def test_project_backend_rule_edge_cases(tmp_path: Path):
    """Assert edge cases: empty manifests, None inputs, and resource_name only."""
    project_name = "edge-cases-app"
    starlark_body = """
load("@NETWORKING/traefik_helpers.star", "project_backend_rule")

r = {
    "both_none": project_backend_rule(None, None),
    "both_empty": project_backend_rule({}, ""),
    "resource_only_dashed": project_backend_rule(None, "payments-api"),
    "resource_only_bare": project_backend_rule(None, "gateway"),
}
"""
    result = run_project_rule(tmp_path, project_name, starlark_body)

    expected_host = f"api.{project_name}.localhost"

    # Empty / None inputs yield empty rule
    assert result["both_none"] == ""
    assert result["both_empty"] == ""

    # Resource name only (without manifest)
    assert (
        result["resource_only_dashed"]
        == f"Host(`{expected_host}`) && PathPrefix(`/api/payments`)"
    )
    assert (
        result["resource_only_bare"]
        == f"Host(`{expected_host}`) && PathPrefix(`/api/gateway`)"
    )
