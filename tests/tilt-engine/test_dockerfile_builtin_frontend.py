# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Generated app Dockerfiles started with `# syntax=docker/dockerfile:1`. That line makes BuildKit fetch the Dockerfile
frontend from Docker Hub, and the external frontend then asks Docker Hub about every local golden base image
(`flisk-l2`, `flisk-l3-backend`, ...). On a restart, where every step is cached, that cost about 1.5 s per image
build (flisk#4237). Docker Engine 25, the oldest version `flisk doctor` accepts, has a built-in frontend that reads
heredocs, so the generated Dockerfiles use it.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest
from test_prisma_backend_single_install import TILT_REQUIRED, generate

pytestmark = [pytest.mark.generator]
DOCKER_REQUIRED = pytest.mark.skipif(
    shutil.which("docker") is None or subprocess.run(["docker", "info"], capture_output=True).returncode != 0,
    reason="Docker daemon not available",
)


@TILT_REQUIRED
@pytest.mark.parametrize(
    ("res_type", "resource_name"),
    [("backend", "orders-api"), ("migrator", "orders-migrator"), ("frontend", "storefront")],
)
def test_generated_dockerfile_uses_the_builtin_frontend(tmp_path, res_type, resource_name):
    dockerfile = generate(tmp_path, res_type, resource_name)
    assert "# syntax=" not in dockerfile, dockerfile.splitlines()[:3]


@TILT_REQUIRED
def test_migrator_dockerfile_still_writes_files_with_heredocs(tmp_path):
    # The heredocs are why the syntax line was added (flisk#1092); the built-in frontend must keep reading them.
    dockerfile = generate(tmp_path, "migrator", "orders-migrator")
    assert "<< 'EOF'" in dockerfile


@DOCKER_REQUIRED
def test_builtin_frontend_builds_a_heredoc_like_the_migrator(tmp_path: Path):
    (tmp_path / "Dockerfile").write_text(
        "FROM busybox:1.36\n"
        "RUN cat > /migrate.sh << 'EOF'\n"
        "#!/bin/sh\n"
        "export DATABASE_URL=postgres://x\n"
        "echo migrated\n"
        "EOF\n"
        "RUN sh /migrate.sh | grep -q migrated\n"
    )
    proc = subprocess.run(
        ["docker", "build", "--progress=plain", "-t", "flisk-heredoc-probe:test", str(tmp_path)],
        capture_output=True,
        text=True,
        timeout=300,
    )
    subprocess.run(["docker", "image", "rm", "-f", "flisk-heredoc-probe:test"], capture_output=True)
    assert proc.returncode == 0, proc.stderr[-3000:]
    assert "docker/dockerfile" not in proc.stderr
