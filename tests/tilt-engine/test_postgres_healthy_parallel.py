# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
`postgres-healthy` must run in parallel with image builds (#4127).

Tilt runs a local resource without `allow_parallel=True` only when no other update runs. The check is a read-only poll of
the Postgres container, but without the flag it waited for the slowest image build: on the demo, Postgres was up at
22:27:15 and its health check only ran at 22:29:50, when the migrator image finished, so the migrator and every API
waited with it.
"""

import re
from pathlib import Path

INFRA_LOADER = Path(__file__).resolve().parents[2] / "runtime/engine/topologies/tilt/resources/infra-loader.star"


def _local_resource_call(source, name):
    start = source.index("name='" + name + "'")
    call_start = source.rindex("local_resource(", 0, start)
    depth = 0
    for index in range(call_start + len("local_resource"), len(source)):
        if source[index] == "(":
            depth += 1
        elif source[index] == ")":
            depth -= 1
            if depth == 0:
                return source[call_start : index + 1]
    raise AssertionError("unterminated local_resource call for " + name)


def test_postgres_healthy_allows_parallel_updates():
    call = _local_resource_call(INFRA_LOADER.read_text(), "postgres-healthy")
    assert re.search(r"\ballow_parallel\s*=\s*True\b", call), call
