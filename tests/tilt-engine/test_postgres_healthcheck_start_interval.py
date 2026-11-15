# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
The shared Postgres is reported healthy about when it is ready, not at the first steady-state probe.

Postgres accepts connections about 0.4 s after its container starts, but with only `interval: 5s` Docker first looks at it
after 5 s, and the migrator and every service that needs the database start after that look. On the shop benchmark that
wait was the largest single part of a restart (#3857, #4237). During the start period the probe runs at the same short
`start_interval` as every other container Flisk generates.
"""

from __future__ import annotations

import re

from test_dependson_platform_postgres import INFRA_LOADER, TILT_REQUIRED, run_starlark


def _postgres_healthcheck(tmp_path, env=None):
    """The `healthcheck:` keys of the generated database compose file, as text values."""
    result = run_starlark(
        tmp_path,
        f"load('{INFRA_LOADER}', 'Infra')\nr = {{'compose': Infra.database_compose()}}\n",
        env=env,
    )
    block = re.search(r"^    healthcheck:\n((?:      .*\n)+)", result["compose"], re.MULTILINE)
    assert block, result["compose"]
    return dict(line.strip().split(": ", 1) for line in block.group(1).splitlines())


@TILT_REQUIRED
def test_postgres_is_probed_at_the_short_start_interval_while_it_starts(tmp_path, monkeypatch):
    # A developer may have these set; this test is about the defaults.
    monkeypatch.delenv("FLISK_HEALTHCHECK_START_INTERVAL_SECONDS", raising=False)
    monkeypatch.delenv("FLISK_HEALTHCHECK_START_PERIOD_SECONDS", raising=False)
    healthcheck = _postgres_healthcheck(tmp_path)
    assert healthcheck["start_interval"] == "0.5s"
    assert healthcheck["start_period"] == "30s"
    # The steady-state probe and its patience are unchanged.
    assert healthcheck["interval"] == "5s"
    assert healthcheck["timeout"] == "5s"
    assert healthcheck["retries"] == "20"
    assert "pg_isready" in healthcheck["test"]


@TILT_REQUIRED
def test_postgres_start_interval_follows_the_shared_healthcheck_settings(tmp_path):
    healthcheck = _postgres_healthcheck(
        tmp_path,
        env={"FLISK_HEALTHCHECK_START_INTERVAL_SECONDS": "1", "FLISK_HEALTHCHECK_START_PERIOD_SECONDS": "45"},
    )
    assert healthcheck["start_interval"] == "1s"
    assert healthcheck["start_period"] == "45s"


@TILT_REQUIRED
def test_postgres_probe_asks_over_tcp_so_the_init_time_server_does_not_count(tmp_path):
    """On an empty volume the postgres image first runs a temporary server that listens on the Unix socket only, then stops it.

    A probe with no host goes through that socket, and one success marks the container healthy, so with the short start
    interval the database could be reported ready while the real server is not up yet. Asking 127.0.0.1 only succeeds once
    the real server listens.
    """
    probe = _postgres_healthcheck(tmp_path)["test"]
    assert re.search(r"pg_isready\b[^\"]*-h 127\.0\.0\.1\b", probe), probe
