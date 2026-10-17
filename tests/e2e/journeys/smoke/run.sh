#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# The smoke manifest block through a real tdk up (moved from scripts/verify-smoke.sh, #1298). SM1 is the whole check: phase 1 (a good
# block passes) and phase 2 (a missing route fails with a retained record). The script keeps its own throwaway project, so the
# workflow's artifact step still finds the records in VERIFY_SMOKE_ARTIFACT_DIR.
#
#   tests/e2e/journeys/smoke/run.sh SM1
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init smoke smoke

SM1() { # a good smoke block passes, and a missing route fails tdk up with a record
  log "SM1 smoke block passes, then a missing route fails with a retained record"
  bash "$SUITE_DIR/verify-smoke.sh"
}

e2e_main "$@"
