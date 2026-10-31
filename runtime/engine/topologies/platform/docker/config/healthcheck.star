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
#   FLISK_HEALTHCHECK_INTERVAL_SECONDS=15 flisk up
# =============================================================================


def _env_int(name, default):
    raw = os.environ.get(name, '')
    if raw and raw.isdigit() and int(raw) > 0:
        return int(raw)
    return default


DOCKER_HEALTHCHECK = {
    "path": "/health",
    "interval_seconds": _env_int("FLISK_HEALTHCHECK_INTERVAL_SECONDS", 30),
    "start_interval_seconds": _env_int("FLISK_HEALTHCHECK_START_INTERVAL_SECONDS", 2),
    "timeout_seconds": _env_int("FLISK_HEALTHCHECK_TIMEOUT_SECONDS", 5),
    "start_period_seconds": _env_int("FLISK_HEALTHCHECK_START_PERIOD_SECONDS", 30),
    "frontend_start_period_seconds": _env_int("FLISK_HEALTHCHECK_START_PERIOD_SECONDS", 30),
    "retries": _env_int("FLISK_HEALTHCHECK_RETRIES", 3),
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


def compose_healthcheck_timing(start_period_seconds = None, indent = "      ", overrides = None):
    """Timing keys for a compose `healthcheck:` block (everything except `test:`).

    `overrides` is a service's `healthCheck` settings (see manifest_health_check): its `interval` and `timeout` (seconds)
    and `retries` replace the defaults.
    """
    h = DOCKER_HEALTHCHECK
    o = overrides or {}
    start_period = start_period_seconds if start_period_seconds != None else h["start_period_seconds"]
    return (
        indent + "interval: {}s\n".format(o.get("interval", h["interval_seconds"]))
        + indent + "timeout: {}s\n".format(o.get("timeout", h["timeout_seconds"]))
        + indent + "retries: {}\n".format(o.get("retries", h["retries"]))
        + indent + "start_period: {}s\n".format(start_period)
        + indent + "start_interval: {}s\n".format(h["start_interval_seconds"])
    )


def _is_number(value):
    return type(value) in ("int", "float")


def manifest_health_check(manifest):
    """A service's `healthCheck` setting in service.json, read the same way as the CLI does (utils/service-manifest.ts).

    Returns struct(disabled, path, timing):
      disabled - True only for `"healthCheck": false` or `{ "enabled": false }`. Nothing else turns the checks off.
      path     - `healthCheck.path`, or None (the caller then uses `healthCheckPath` or its default).
      timing   - the `interval` / `timeout` (seconds) / `retries` the service set, for compose_healthcheck_timing.
    """
    value = manifest.get("healthCheck") if type(manifest) == "dict" else None
    if value == False:
        return struct(disabled = True, path = None, timing = {})
    if type(value) != "dict":
        return struct(disabled = False, path = None, timing = {})
    if value.get("enabled") == False:
        return struct(disabled = True, path = None, timing = {})
    timing = {}
    for key in ["interval", "timeout"]:
        if key in value:
            if not _is_number(value[key]) or value[key] <= 0:
                fail("MANIFEST ERROR: 'healthCheck.{}' must be a positive number of seconds".format(key))
            timing[key] = value[key]
    if "retries" in value:
        if type(value["retries"]) != "int" or value["retries"] < 0:
            fail("MANIFEST ERROR: 'healthCheck.retries' must be a non-negative integer")
        timing["retries"] = value["retries"]
    path = value.get("path") or None
    return struct(disabled = False, path = path, timing = timing)
