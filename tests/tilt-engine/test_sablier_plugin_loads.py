# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""The pinned Sablier Traefik plugin must actually load in the pinned Traefik image (#1235).

Traefik v3.7.14 rejects sablier-traefik-plugin v1.3.1 with "plugin integrity check failed" and then disables
ALL plugins, so every `<name>-sablier` middleware is "invalid middleware type" and the deferred cold-start route
never comes up. That only showed in the scheduled, licensed cold-start E2E. This test needs only Docker and network
access (no license) and catches a bad bump when the version is edited.
"""

import re
import shutil
import subprocess
import time
import uuid
from pathlib import Path

import pytest

pytestmark = [pytest.mark.docker]

REPO_ROOT = Path(__file__).resolve().parents[2]
STANDALONE = REPO_ROOT / "engine" / "topologies" / "platform" / "docker" / "compose" / "traefik_standalone.star"


def _pinned() -> tuple[str, str]:
    source = STANDALONE.read_text()
    image = re.search(r"image: (traefik:v[0-9.]+)", source)
    version = re.search(r"experimental\.plugins\.sablier\.version=(v[0-9.]+)", source)
    assert image and version, "traefik image or sablier plugin version not found in traefik_standalone.star"
    return image.group(1), version.group(1)


def _docker_ready() -> bool:
    if shutil.which("docker") is None:
        return False
    return subprocess.run(["docker", "info"], capture_output=True, timeout=30).returncode == 0


@pytest.mark.skipif(not _docker_ready(), reason="Docker daemon not available")
def test_pinned_sablier_plugin_loads_in_pinned_traefik():
    image, version = _pinned()
    name = f"tdk-plugin-load-{uuid.uuid4().hex[:8]}"
    try:
        subprocess.run(
            [
                "docker", "run", "-d", "--name", name, image,
                "--log.level=DEBUG",
                "--experimental.plugins.sablier.modulename=github.com/sablierapp/sablier-traefik-plugin",
                f"--experimental.plugins.sablier.version={version}",
                "--entrypoints.web.address=:80",
            ],
            check=True, capture_output=True, timeout=300,
        )
        logs = ""
        for _ in range(30):
            time.sleep(2)
            proc = subprocess.run(["docker", "logs", name], capture_output=True, text=True, timeout=30)
            logs = proc.stdout + proc.stderr
            if "Plugins loaded" in logs or "Plugins are disabled" in logs:
                break
        assert "Plugins are disabled" not in logs, (
            f"{image} cannot load sablier-traefik-plugin {version}; pin a version that loads.\n{logs[-2000:]}"
        )
        assert "Plugins loaded" in logs, f"plugin load did not finish in 60s:\n{logs[-2000:]}"
    finally:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True, timeout=60)
