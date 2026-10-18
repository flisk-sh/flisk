#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# The licensed cold-start journey (moved from cold-start-e2e.yml, #1298). CS1 is the whole check: a deferred backend is woken by a
# request during tdk up, with an unrelated slow backend keeping bring-up busy. scripts/e2e/cold-start.sh builds the project, so this
# suite only points it at the scratch directory. Needs TDK_LICENSE_KEY (the workflow sets it for this suite only).
#
#   tests/e2e/journeys/cold-start/run.sh CS1
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init cold-start cold-start

CS1() { # a deferred backend is woken during bring-up
  log "CS1 wake a deferred backend during tdk up"
  mkdir -p "$DIR"
  bash "$REPO_ROOT/scripts/e2e/cold-start.sh" "$DIR"
}

e2e_main "$@"
