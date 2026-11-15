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
def test_postgres_is_probed_at_the_short_start_interval_while_it_starts(tmp_path):
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
