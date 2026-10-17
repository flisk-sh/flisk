#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# A worker resource on a live stack (openspec task 3.6, #1290). Runs nightly, on release and by hand; see suite.json.
#
#   tests/e2e/resource-types/worker/run.sh all              every case in order, then cleanup
#   tests/e2e/resource-types/worker/run.sh W1 W2            single cases
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
# shellcheck source=../common.sh
source "$SUITE_DIR/../common.sh"
e2e_init worker worker
STACK=shop
RES=worker
RESOURCES=("$RES")

W1() { # scaffold the worker in a project
  log "W1 scaffold a worker"
  common_scaffold worker "$RES" --stack "$STACK" --yes
}

W2() { # tdk up, then the worker is listed as a worker in tdk status
  log "W2 tdk up and status lists $RES as a worker"
  : >"$DIR/up.log"
  start_stack "$STACK"
  # A worker serves no route, so tdk status gives it no Traefik url; wait for its status entry, not for a url.
  common_wait_status "$RES" worker
}

# The scaffolded worker is a stub that logs one line and exits, so its container may already have stopped: read the logs of
# the newest container for the resource, running or not, and bound the wait.
worker_container() { docker ps -aq --filter "name=${PROJECT}-.*-$RES-" | head -1; }
worker_logged_start() { local c; c="$(worker_container)"; [ -n "$c" ] && docker logs "$c" 2>&1 | grep -q "$RES worker started"; }

W3() { # the worker's container logged its start line
  log "W3 the $RES container logged its start line"
  poll_until "$RES logged 'worker started'" 180 worker_logged_start
}

e2e_main "$@"
