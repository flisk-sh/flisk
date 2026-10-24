#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Opt-in container scale gate for git hooks. No-op unless FLISK_BENCH_GATE=1.
#   FLISK_BENCH_GATE=1 git push            # run full gate (tiers up to 100)
#   FLISK_BENCH_GATE=1 FLISK_BENCH_TIERS=5,10,20 git commit ...
set -euo pipefail
[ "${FLISK_BENCH_GATE:-0}" = "1" ] || exit 0
cd "$(dirname "$0")/../.."
tiers="${FLISK_BENCH_TIERS:-5,10,20,50,80,100}"
exec bun scripts/benchmark/container-scale.ts --tiers "$tiers" --gate "${tiers##*,}"
