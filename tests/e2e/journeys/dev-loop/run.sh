#!/usr/bin/env bash
# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
# The Go development loop through a real flisk up (moved from scripts/e2e/go-dev-loop.sh, #1298). DL1 is the whole check: go-dev-loop.sh
# builds the project, and go-dev-loop-probe.py drives the edits against it. The script keeps its own throwaway project and cleans up.
#
#   tests/e2e/journeys/dev-loop/run.sh DL1           (DEV_LOOP_EDITS sets the number of valid edits, default 5)
#   GO_SERVICE_DIR=<dir> tests/e2e/journeys/dev-loop/run.sh DL1    use that directory's go.mod and main.go instead of the scaffold
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init dev-loop dev-loop

DL1() { # the Go live-reload loop: edits are served without a rebuild, a broken edit keeps the last good build, and recovery works
  log "DL1 Go live reload through flisk up and Traefik (${DEV_LOOP_EDITS:-5} valid edits)"
  bash "$SUITE_DIR/go-dev-loop.sh" "${DEV_LOOP_EDITS:-5}"
}

e2e_main "$@"
