# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# Docker healthcheck timing - single source for golden images, L4 runtimes and
# generated compose files.
# =============================================================================
# Steady-state probes are infrequent (each probe is a `docker exec`, which adds
# up across 100+ containers), while `start_interval` keeps first-healthy time
# fast during the start period. `start_interval` needs Docker Engine 25+ and
# Compose 2.20.2+ (checked by `flisk doctor`).
#
# Override per run with environment variables, e.g.:
#   TDK_HEALTHCHECK_INTERVAL_SECONDS=15 flisk up
# =============================================================================


def _env_int(name, default):
    raw = os.environ.get(name, '')
    if raw and raw.isdigit() and int(raw) > 0:
        return int(raw)
    return default


DOCKER_HEALTHCHECK = {
    "path": "/health",
    "interval_seconds": _env_int("TDK_HEALTHCHECK_INTERVAL_SECONDS", 30),
    "start_interval_seconds": _env_int("TDK_HEALTHCHECK_START_INTERVAL_SECONDS", 2),
    "timeout_seconds": _env_int("TDK_HEALTHCHECK_TIMEOUT_SECONDS", 5),
    "start_period_seconds": _env_int("TDK_HEALTHCHECK_START_PERIOD_SECONDS", 30),
    "frontend_start_period_seconds": _env_int("TDK_HEALTHCHECK_START_PERIOD_SECONDS", 30),
    "retries": _env_int("TDK_HEALTHCHECK_RETRIES", 3),
}


def dockerfile_healthcheck_flags(start_period_seconds = None):
    """Flags for a Dockerfile `HEALTHCHECK` instruction."""
    h = DOCKER_HEALTHCHECK
    start_period = start_period_seconds if start_period_seconds != None else h["start_period_seconds"]
    return "--interval={}s --start-interval={}s --timeout={}s --start-period={}s --retries={}".format(
        h["interval_seconds"],
        h["start_interval_seconds"],
        h["timeout_seconds"],
        start_period,
        h["retries"],
    )


def compose_healthcheck_timing(start_period_seconds = None, indent = "      "):
    """Timing keys for a compose `healthcheck:` block (everything except `test:`)."""
    h = DOCKER_HEALTHCHECK
    start_period = start_period_seconds if start_period_seconds != None else h["start_period_seconds"]
    return (
        indent + "interval: {}s\n".format(h["interval_seconds"])
        + indent + "timeout: {}s\n".format(h["timeout_seconds"])
        + indent + "retries: {}\n".format(h["retries"])
        + indent + "start_period: {}s\n".format(start_period)
        + indent + "start_interval: {}s\n".format(h["start_interval_seconds"])
    )
