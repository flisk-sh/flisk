# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""A frontend's browser-facing URLs carry the router port.

When another project holds port 80, `flisk up` moves this project's Traefik to another port. The browser has to call that
port: without it, API calls reach the other project's router and 404.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = [pytest.mark.fast, pytest.mark.generator]

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_STAR = (
    REPO_ROOT / "runtime" / "engine" / "topologies" / "tilt" / "resources" / "orchestrator" / "generators" / "env.star"
)
RESULT_MARKER = "Error in fail: RESULT"


def _generate(tmp_path: Path, http_port: str | None, app_type: str = "frontend") -> str:
    (tmp_path / ".flisk").mkdir()
    (tmp_path / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "shop"}}))
    set_port = f"os.environ['FLISK_HTTP_PORT'] = '{http_port}'\n" if http_port is not None else "os.environ.pop('FLISK_HTTP_PORT', None)\n"
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(
        f"os.environ['FLISK_PROJECT_ROOT'] = '{tmp_path}'\n"
        + set_port
        + f"load('{ENV_STAR}', 'EnvGenerators')\n"
        + "out = {}\n"
        + "def write(path, content):\n    out[path] = content\n"
        + "manifest = {'appType': '" + app_type + "', 'stack': 'main', 'appName': 'web', 'name': 'web', 'dependsOn': ['orders'],\n"
        + "  '_resource_path': 'services/main/web'}\n"
        + "EnvGenerators.generate_params_env(manifest, None, write)\n"
        + "fail('RESULT' + encode_json(out))\n"
    )
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)], capture_output=True, text=True, timeout=180
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    files = json.loads(output.split(RESULT_MARKER, 1)[1].strip())
    return "".join(files.values())


needs_tilt = pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")


def _line(env: str, name: str) -> str:
    return next(line for line in env.splitlines() if line.startswith(name + "="))


@needs_tilt
def test_browser_urls_carry_a_moved_router_port(tmp_path):
    env = _generate(tmp_path, "8081")
    assert ".localhost:8081/" in _line(env, "VITE_API_URL")
    assert ".localhost:8081/" in _line(env, "PUBLIC_URL")


@needs_tilt
@pytest.mark.parametrize("port", ["80", "", None])
def test_browser_urls_stay_portless_on_port_80(tmp_path, port):
    env = _generate(tmp_path, port)
    assert ".localhost:" not in _line(env, "VITE_API_URL")
    assert ".localhost:" not in _line(env, "PUBLIC_URL")


@needs_tilt
def test_a_backend_env_does_not_change_with_the_router_port(tmp_path):
    # Only the browser is outside the Docker network; a backend's API_URL is not a browser URL.
    env = _generate(tmp_path, "8081", app_type="backend")
    assert ":8081" not in _line(env, "API_URL")
