# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""Direct tests for get_frontend_traefik_labels in docker networking traefik.star.

Pins the exact label map generated for frontend services, covering:
- Standard frontend in a single-stack project
- Frontend in a multi-stack project with custom domain and routing
- Frontend without manifest (fallback defaults)
- Frontend with Next.js framework (omits stripprefix middleware)
- Frontend with maintenance feature enabled (maintenance@file middleware)

Spec / Issue: https://github.com/flisk-sh/flisk/issues/2411
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


def test_frontend_traefik_labels_single_stack(tmp_path):
    """Assert the exact label map for a frontend in a single-stack project."""
    body = """
load('@NETWORKING/traefik.star', 'get_frontend_traefik_labels')

manifest = {
    'appType': 'frontend',
    'stack': 'app',
    'framework': 'react',
    'port': 3000,
}
l = get_frontend_traefik_labels(
    'web',
    'app',
    '/web',
    80,
    manifest=manifest,
)
r = {'labels': l}
"""
    labels = run_traefik_labels(tmp_path, "testproj", body)

    expected = {
        "traefik.enable": "true",
        "traefik.http.routers.testproj-web.rule": "Host(`web.localhost`) || (Host(`app.testproj.localhost`) && PathPrefix(`/web`)) || (Host(`localhost`) && PathPrefix(`/web`))",
        "traefik.http.routers.testproj-web.entrypoints": "web,websecure",
        "traefik.http.routers.testproj-web.priority": "104",
        "traefik.http.routers.testproj-web.middlewares": "testproj-web-strip-prefix",
        "traefik.http.middlewares.testproj-web-strip-prefix.stripprefix.prefixes": "/web",
        "traefik.http.services.testproj-web.loadbalancer.server.port": "80",
        "traefik.docker.network": "testproj_traefik-public",
    }
    assert labels == expected


def test_frontend_traefik_labels_multi_stack(tmp_path):
    """Assert the exact label map for a frontend in a multi-stack project."""
    body = """
load('@NETWORKING/traefik.star', 'get_frontend_traefik_labels')

manifest = {
    'appType': 'frontend',
    'stack': 'shop',
    'framework': 'react',
    'port': 3000,
    'traefik': {'host': 'shop.testproj.local'},
}
l = get_frontend_traefik_labels(
    'shop-web',
    'shop',
    '/shop',
    80,
    traefik_host='shop.testproj.local',
    manifest=manifest,
)
r = {'labels': l}
"""
    labels = run_traefik_labels(tmp_path, "testproj", body)

    expected = {
        "traefik.enable": "true",
        "traefik.http.routers.testproj-shop-web.rule": "Host(`shop-web.localhost`) || Host(`shop.testproj.local`) || (Host(`app.testproj.localhost`) && PathPrefix(`/shop`)) || (Host(`localhost`) && PathPrefix(`/shop`))",
        "traefik.http.routers.testproj-shop-web.entrypoints": "web,websecure",
        "traefik.http.routers.testproj-shop-web.priority": "105",
        "traefik.http.routers.testproj-shop-web.middlewares": "testproj-shop-web-strip-prefix",
        "traefik.http.middlewares.testproj-shop-web-strip-prefix.stripprefix.prefixes": "/shop",
        "traefik.http.services.testproj-shop-web.loadbalancer.server.port": "80",
        "traefik.docker.network": "testproj_traefik-public",
    }
    assert labels == expected


def test_frontend_traefik_labels_without_manifest(tmp_path):
    """When manifest is None, default router, stripprefix middleware, port, and network are generated."""
    body = """
load('@NETWORKING/traefik.star', 'get_frontend_traefik_labels')

l = get_frontend_traefik_labels(
    'web',
    'app',
    '/',
    80,
    manifest=None,
)
r = {'labels': l}
"""
    labels = run_traefik_labels(tmp_path, "testproj", body)

    expected = {
        "traefik.enable": "true",
        "traefik.http.routers.testproj-web.rule": "Host(`web.localhost`) || (Host(`app.testproj.localhost`) && PathPrefix(`/`)) || (Host(`localhost`) && PathPrefix(`/`))",
        "traefik.http.routers.testproj-web.entrypoints": "web,websecure",
        "traefik.http.routers.testproj-web.priority": "101",
        "traefik.http.routers.testproj-web.middlewares": "testproj-web-strip-prefix",
        "traefik.http.middlewares.testproj-web-strip-prefix.stripprefix.prefixes": "/",
        "traefik.http.services.testproj-web.loadbalancer.server.port": "80",
        "traefik.docker.network": "testproj_traefik-public",
    }
    assert labels == expected


def test_frontend_traefik_labels_nextjs_omits_stripprefix(tmp_path):
    """Next.js frontends serve under their own basePath, so stripprefix middleware is omitted."""
    body = """
load('@NETWORKING/traefik.star', 'get_frontend_traefik_labels')

manifest = {
    'appType': 'frontend',
    'stack': 'app',
    'framework': 'next',
    'port': 3000,
}
l = get_frontend_traefik_labels(
    'next-web',
    'app',
    '/web',
    3000,
    manifest=manifest,
)
r = {'labels': l}
"""
    labels = run_traefik_labels(tmp_path, "testproj", body)

    expected = {
        "traefik.enable": "true",
        "traefik.http.routers.testproj-next-web.rule": "Host(`next-web.localhost`) || (Host(`app.testproj.localhost`) && PathPrefix(`/web`)) || (Host(`localhost`) && PathPrefix(`/web`))",
        "traefik.http.routers.testproj-next-web.entrypoints": "web,websecure",
        "traefik.http.routers.testproj-next-web.priority": "104",
        "traefik.http.services.testproj-next-web.loadbalancer.server.port": "3000",
        "traefik.docker.network": "testproj_traefik-public",
    }
    assert labels == expected
    assert "traefik.http.routers.testproj-next-web.middlewares" not in labels
    assert "traefik.http.middlewares.testproj-next-web-strip-prefix.stripprefix.prefixes" not in labels


def test_frontend_traefik_labels_with_maintenance_middleware(tmp_path):
    """When maintenance feature is enabled, maintenance@file is added to router middlewares."""
    body = """
load('@NETWORKING/traefik.star', 'get_frontend_traefik_labels')

manifest = {
    'appType': 'frontend',
    'stack': 'app',
    'framework': 'react',
    'featuresEnabled': ['maintenance'],
}
l = get_frontend_traefik_labels(
    'web',
    'app',
    '/web',
    80,
    manifest=manifest,
)
r = {'labels': l}
"""
    labels = run_traefik_labels(tmp_path, "testproj", body)

    assert labels["traefik.http.routers.testproj-web.middlewares"] == "testproj-web-strip-prefix,maintenance@file"
    assert labels["traefik.http.middlewares.testproj-web-strip-prefix.stripprefix.prefixes"] == "/web"
