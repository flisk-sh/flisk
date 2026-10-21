#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The deferred cold start through a real flisk up (moved from scripts/e2e/cold-start.sh, #1298). CS1 is the whole check: cold-start.sh
# scaffolds the project, runs flisk up, and wakes the deferred backend. The project stays at $RUNNER_TEMP/tdk-cold-start (or $TMPDIR
# locally) so the workflow's diagnostics and artifact paths do not change.
#
#   TDK_LICENSE_KEY=<key with sablier> tests/e2e/journeys/cold-start/run.sh CS1
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init cold-start cold-start

CS1() { # a deferred backend is prebuilt, absent until its first request, and woken during an unrelated slow start
  log "CS1 deferred cold start through flisk up and the wake gateway"
  local project="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/tdk-cold-start"
  mkdir -p "$project"
  bash "$SUITE_DIR/cold-start.sh" "$project"
}

e2e_main "$@"
