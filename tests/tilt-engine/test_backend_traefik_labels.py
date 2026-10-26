# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""Direct tests for get_backend_traefik_labels in docker networking traefik.star.

Pins the exact label map generated for backend services, covering:
- Standard backend without explicit manifest route
- Backend with explicit manifest route (traefik.host and traefik.pathPrefix)
- Shared stack backend with and without explicit route (stack collision avoidance)
- Backend without healthcheck (bring-your-own / no HTTP probe)
- Backend without manifest (standalone base router)

Spec / Issue: https://github.com/flisk-sh/flisk/issues/2410
"""

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
NETWORKING_DIR = REPO_ROOT / "runtime" / "engine" / "topologies" / "platform" / "docker" / "networking"
RESULT_MARKER = "Error in fail: RESULT"


def parse_traefik_labels(labels_text: str) -> dict[str, str]:
    """Parse Compose YAML label lines into a key-value dictionary."""
    labels = {}
    for line in labels_text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith('- "') and line.endswith('"'):
            content = line[3:-1]
        elif line.startswith("- '") and line.endswith("'"):
            content = line[3:-1]
        elif line.startswith("- "):
            content = line[2:]
        else:
            continue
        if "=" in content:
            k, v = content.split("=", 1)
            labels[k] = v
    return labels


def run_traefik_labels(tmp_path: Path, project_name: str, tiltfile_body: str) -> dict[str, str]:
    """Evaluate `tiltfile_body` under project `project_name` and return the parsed label map."""
    project_root = tmp_path / project_name
    (project_root / ".flisk").mkdir(parents=True, exist_ok=True)
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": project_name}}))
    tiltfile = project_root / "Tiltfile"
    tiltfile.write_text(
        tiltfile_body.replace("@NETWORKING", str(NETWORKING_DIR))
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
    raw_labels = json.loads(output.split(RESULT_MARKER, 1)[1].strip())["labels"]
    return parse_traefik_labels(raw_labels)


def test_backend_traefik_labels_without_explicit_route(tmp_path):
    """A standard backend without explicit traefik route gets default stack and project routers."""
    body = """
load('@NETWORKING/traefik.star', 'get_backend_traefik_labels')

manifest = {'appType': 'backend', 'stack': 'orders', 'port': 4000}
l = get_backend_traefik_labels(
    'orders-api',
    'orders.backend.testproj.local',
    '/api/v1/orders-management',
    'orders-api',
    4000,
    '/health',
    manifest=manifest,
)
r = {'labels': l}
"""
    labels = run_traefik_labels(tmp_path, "testproj", body)

    expected = {
        "traefik.enable": "true",
        "traefik.http.routers.testproj-orders-api.rule": "Host(`orders.backend.testproj.local`) || PathPrefix(`/api/v1/orders-management`)",
        "traefik.http.routers.testproj-orders-api.entrypoints": "web",
        "traefik.http.routers.testproj-orders-api.service": "testproj-orders-api",
        "traefik.http.routers.testproj-orders-api.middlewares": "testproj-orders-api-strip-prefix",
        "traefik.http.middlewares.testproj-orders-api-strip-prefix.stripprefix.prefixes": "/api/v1/orders-management",
        "traefik.http.services.testproj-orders-api.loadbalancer.server.port": "4000",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.path": "/health",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.interval": "10s",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.timeout": "5s",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.followredirects": "false",
        "traefik.docker.network": "testproj_traefik-public",
        "traefik.http.routers.testproj-orders-api-project.rule": "Host(`api.testproj.localhost`) && PathPrefix(`/api/orders`)",
        "traefik.http.routers.testproj-orders-api-project.entrypoints": "web",
        "traefik.http.routers.testproj-orders-api-project.service": "testproj-orders-api",
        "traefik.http.routers.testproj-orders-api-project.middlewares": "testproj-orders-api-strip-prefix-project",
        "traefik.http.middlewares.testproj-orders-api-strip-prefix-project.stripprefix.prefixes": "/api/orders",
        "traefik.http.routers.testproj-orders-api-project.priority": "111",
        "traefik.http.routers.testproj-orders-api-management.rule": "Host(`api.testproj.localhost`) && PathPrefix(`/api/orders-management`)",
        "traefik.http.routers.testproj-orders-api-management.entrypoints": "web",
        "traefik.http.routers.testproj-orders-api-management.service": "testproj-orders-api",
        "traefik.http.routers.testproj-orders-api-management.middlewares": "testproj-orders-api-strip-prefix-management",
        "traefik.http.middlewares.testproj-orders-api-strip-prefix-management.stripprefix.prefixes": "/api/orders-management",
        "traefik.http.routers.testproj-orders-api-management.priority": "122",
        "traefik.http.middlewares.testproj-orders-api-redirect.redirectregex.regex": "^`/orders-management/api/v1/(.*)`",
        "traefik.http.middlewares.testproj-orders-api-redirect.redirectregex.replacement": "`/api/orders/$$1`",
        "traefik.http.middlewares.testproj-orders-api-redirect.redirectregex.permanent": "true",
    }
    assert labels == expected


def test_backend_traefik_labels_with_explicit_route(tmp_path):
    """A backend with explicit manifest traefik config uses that route for its router."""
    body = """
load('@NETWORKING/traefik.star', 'get_backend_traefik_labels')

manifest = {
    'appType': 'backend',
    'stack': 'orders',
    'port': 4000,
    'traefik': {'host': 'custom.orders.local', 'pathPrefix': '/custom/orders'},
}
l = get_backend_traefik_labels(
    'orders-api',
    'custom.orders.local',
    '/custom/orders',
    'orders-api',
    4000,
    '/health',
    manifest=manifest,
)
r = {'labels': l}
"""
    labels = run_traefik_labels(tmp_path, "testproj", body)

    expected = {
        "traefik.enable": "true",
        "traefik.http.routers.testproj-orders-api.rule": "Host(`custom.orders.local`) || PathPrefix(`/custom/orders`)",
        "traefik.http.routers.testproj-orders-api.entrypoints": "web",
        "traefik.http.routers.testproj-orders-api.service": "testproj-orders-api",
        "traefik.http.routers.testproj-orders-api.middlewares": "testproj-orders-api-strip-prefix",
        "traefik.http.middlewares.testproj-orders-api-strip-prefix.stripprefix.prefixes": "/custom/orders",
        "traefik.http.services.testproj-orders-api.loadbalancer.server.port": "4000",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.path": "/health",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.interval": "10s",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.timeout": "5s",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.followredirects": "false",
        "traefik.docker.network": "testproj_traefik-public",
        "traefik.http.routers.testproj-orders-api-project.rule": "Host(`api.testproj.localhost`) && PathPrefix(`/api/orders`)",
        "traefik.http.routers.testproj-orders-api-project.entrypoints": "web",
        "traefik.http.routers.testproj-orders-api-project.service": "testproj-orders-api",
        "traefik.http.routers.testproj-orders-api-project.middlewares": "testproj-orders-api-strip-prefix-project",
        "traefik.http.middlewares.testproj-orders-api-strip-prefix-project.stripprefix.prefixes": "/api/orders",
        "traefik.http.routers.testproj-orders-api-project.priority": "111",
        "traefik.http.routers.testproj-orders-api-management.rule": "Host(`api.testproj.localhost`) && PathPrefix(`/api/orders-management`)",
        "traefik.http.routers.testproj-orders-api-management.entrypoints": "web",
        "traefik.http.routers.testproj-orders-api-management.service": "testproj-orders-api",
        "traefik.http.routers.testproj-orders-api-management.middlewares": "testproj-orders-api-strip-prefix-management",
        "traefik.http.middlewares.testproj-orders-api-strip-prefix-management.stripprefix.prefixes": "/api/orders-management",
        "traefik.http.routers.testproj-orders-api-management.priority": "122",
        "traefik.http.middlewares.testproj-orders-api-redirect.redirectregex.regex": "^`/orders-management/api/v1/(.*)`",
        "traefik.http.middlewares.testproj-orders-api-redirect.redirectregex.replacement": "`/api/orders/$$1`",
        "traefik.http.middlewares.testproj-orders-api-redirect.redirectregex.permanent": "true",
    }
    assert labels == expected


def test_shared_stack_backend_without_explicit_route_drops_stack_router(tmp_path):
    """When a stack is shared, a backend without an explicit route drops the stack router to avoid collisions."""
    body = """
load('@NETWORKING/traefik.star', 'get_backend_traefik_labels')

manifest = {
    'appType': 'backend',
    'stack': 'orders',
    'port': 4000,
    '_stackBackendCount': 2,
}
l = get_backend_traefik_labels(
    'orders-api',
    'orders.backend.testproj.local',
    '/api/v1/orders-management',
    'orders-api',
    4000,
    '/health',
    manifest=manifest,
)
r = {'labels': l}
"""
    labels = run_traefik_labels(tmp_path, "testproj", body)

    expected = {
        "traefik.enable": "true",
        "traefik.http.services.testproj-orders-api.loadbalancer.server.port": "4000",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.path": "/health",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.interval": "10s",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.timeout": "5s",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.followredirects": "false",
        "traefik.docker.network": "testproj_traefik-public",
        "traefik.http.routers.testproj-orders-api-project.rule": "Host(`api.testproj.localhost`) && PathPrefix(`/api/orders`)",
        "traefik.http.routers.testproj-orders-api-project.entrypoints": "web",
        "traefik.http.routers.testproj-orders-api-project.service": "testproj-orders-api",
        "traefik.http.routers.testproj-orders-api-project.middlewares": "testproj-orders-api-strip-prefix-project",
        "traefik.http.middlewares.testproj-orders-api-strip-prefix-project.stripprefix.prefixes": "/api/orders",
        "traefik.http.routers.testproj-orders-api-project.priority": "111",
        "traefik.http.middlewares.testproj-orders-api-redirect.redirectregex.regex": "^`/orders-management/api/v1/(.*)`",
        "traefik.http.middlewares.testproj-orders-api-redirect.redirectregex.replacement": "`/api/orders/$$1`",
        "traefik.http.middlewares.testproj-orders-api-redirect.redirectregex.permanent": "true",
    }
    assert labels == expected
    # Stack-level router and management router must NOT be present
    assert "traefik.http.routers.testproj-orders-api.rule" not in labels
    assert "traefik.http.routers.testproj-orders-api-management.rule" not in labels


def test_shared_stack_backend_with_explicit_route_retains_explicit_router(tmp_path):
    """In a shared stack, a backend that specifies an explicit route keeps its own router with that rule."""
    body = """
load('@NETWORKING/traefik.star', 'get_backend_traefik_labels')

manifest = {
    'appType': 'backend',
    'stack': 'orders',
    'port': 4000,
    '_stackBackendCount': 2,
    'traefik': {'host': 'custom.orders.local', 'pathPrefix': '/custom/orders'},
}
l = get_backend_traefik_labels(
    'orders-api',
    'orders.backend.testproj.local',
    '/api/v1/orders-management',
    'orders-api',
    4000,
    '/health',
    manifest=manifest,
)
r = {'labels': l}
"""
    labels = run_traefik_labels(tmp_path, "testproj", body)

    expected = {
        "traefik.enable": "true",
        "traefik.http.routers.testproj-orders-api.rule": "Host(`custom.orders.local`) || PathPrefix(`/custom/orders`)",
        "traefik.http.routers.testproj-orders-api.entrypoints": "web",
        "traefik.http.routers.testproj-orders-api.service": "testproj-orders-api",
        "traefik.http.routers.testproj-orders-api.middlewares": "testproj-orders-api-strip-prefix",
        "traefik.http.middlewares.testproj-orders-api-strip-prefix.stripprefix.prefixes": "/api/v1/orders-management",
        "traefik.http.services.testproj-orders-api.loadbalancer.server.port": "4000",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.path": "/health",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.interval": "10s",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.timeout": "5s",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.followredirects": "false",
        "traefik.docker.network": "testproj_traefik-public",
        "traefik.http.routers.testproj-orders-api-project.rule": "Host(`api.testproj.localhost`) && PathPrefix(`/api/orders`)",
        "traefik.http.routers.testproj-orders-api-project.entrypoints": "web",
        "traefik.http.routers.testproj-orders-api-project.service": "testproj-orders-api",
        "traefik.http.routers.testproj-orders-api-project.middlewares": "testproj-orders-api-strip-prefix-project",
        "traefik.http.middlewares.testproj-orders-api-strip-prefix-project.stripprefix.prefixes": "/api/orders",
        "traefik.http.routers.testproj-orders-api-project.priority": "111",
        "traefik.http.middlewares.testproj-orders-api-redirect.redirectregex.regex": "^`/orders-management/api/v1/(.*)`",
        "traefik.http.middlewares.testproj-orders-api-redirect.redirectregex.replacement": "`/api/orders/$$1`",
        "traefik.http.middlewares.testproj-orders-api-redirect.redirectregex.permanent": "true",
    }
    assert labels == expected
    # The router rule matches the explicit route
    assert labels["traefik.http.routers.testproj-orders-api.rule"] == "Host(`custom.orders.local`) || PathPrefix(`/custom/orders`)"


def test_backend_traefik_labels_without_health_path(tmp_path):
    """When health_path is None or empty, healthcheck labels are omitted."""
    body = """
load('@NETWORKING/traefik.star', 'get_backend_traefik_labels')

manifest = {'appType': 'backend', 'stack': 'orders', 'port': 4000}
l = get_backend_traefik_labels(
    'orders-api',
    'orders.backend.testproj.local',
    '/api/v1/orders-management',
    'orders-api',
    4000,
    None,
    manifest=manifest,
)
r = {'labels': l}
"""
    labels = run_traefik_labels(tmp_path, "testproj", body)

    assert "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.path" not in labels
    assert "traefik.http.services.testproj-orders-api.loadbalancer.server.port" in labels
    assert labels["traefik.http.services.testproj-orders-api.loadbalancer.server.port"] == "4000"


def test_backend_traefik_labels_without_manifest(tmp_path):
    """When manifest is None, only base router, port, healthcheck and network labels are generated."""
    body = """
load('@NETWORKING/traefik.star', 'get_backend_traefik_labels')

l = get_backend_traefik_labels(
    'orders-api',
    'orders.backend.testproj.local',
    '/api/orders',
    'orders-api',
    4000,
    '/health',
    manifest=None,
)
r = {'labels': l}
"""
    labels = run_traefik_labels(tmp_path, "testproj", body)

    expected = {
        "traefik.enable": "true",
        "traefik.http.routers.testproj-orders-api.rule": "Host(`orders.backend.testproj.local`) || PathPrefix(`/api/orders`)",
        "traefik.http.routers.testproj-orders-api.entrypoints": "web",
        "traefik.http.routers.testproj-orders-api.service": "testproj-orders-api",
        "traefik.http.routers.testproj-orders-api.middlewares": "testproj-orders-api-strip-prefix",
        "traefik.http.middlewares.testproj-orders-api-strip-prefix.stripprefix.prefixes": "/api/orders",
        "traefik.http.services.testproj-orders-api.loadbalancer.server.port": "4000",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.path": "/health",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.interval": "10s",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.timeout": "5s",
        "traefik.http.services.testproj-orders-api.loadbalancer.healthcheck.followredirects": "false",
        "traefik.docker.network": "testproj_traefik-public",
    }
    assert labels == expected
    # Project-level and management routers are only created when manifest is provided
    assert "traefik.http.routers.testproj-orders-api-project.rule" not in labels
    assert "traefik.http.routers.testproj-orders-api-management.rule" not in labels
