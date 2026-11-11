"""The wake-gateway must stop promptly on `docker stop` (flisk#3760).

A bare Bun server running as PID 1 ignores SIGTERM, so every `flisk down`
waited the full 10 s Docker timeout. Guard both defences: an init process in
the compose service and signal handlers in the server.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVER = ROOT / "runtime/engine/assets/docker/wake-gateway/server.ts"
COMPOSE = ROOT / "runtime/engine/topologies/platform/docker/compose/traefik_standalone.star"


def test_server_handles_sigterm_and_sigint():
    src = SERVER.read_text()
    assert '"SIGTERM"' in src and '"SIGINT"' in src
    assert "process.on(signal" in src
    assert "process.exit(0)" in src


def test_compose_service_runs_an_init_and_short_grace_period():
    src = COMPOSE.read_text()
    block = src.split("  wake-gateway:\n", 1)[1].split("    networks:", 1)[0]
    assert re.search(r"^    init: true$", block, re.M)
    assert re.search(r"^    stop_grace_period: \d+s$", block, re.M)
