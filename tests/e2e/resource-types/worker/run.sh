#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# A worker resource on a live stack (openspec task 3.6, #1290; restart and error envelope, #1294). Runs nightly, on release and by hand; see suite.json.
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

worker_replaced() { # <container id from before the restart>: the newest container for the worker is a different one
  local now; now="$(worker_container)"; [ -n "$now" ] && [ "$now" != "$1" ]
}

W4() { # tdk restart, then the worker's new container logs its start line again
  log "W4 tdk restart $RES"
  local before; before="$(worker_container)"
  # The stub may already have exited, so wait on the newest container of any state, not on a running one (see wait_restarted).
  run restart-"$RES" restart "$RES" --json
  [ "$RC" -eq 0 ] || die "tdk restart $RES exited $RC"
  assert envelope "$OUT/restart-$RES.out"
  assert check "$OUT/restart-$RES.out" "j.errors.length === 0 && j.data.resource === '$RES' && j.data.restarted === true" "restart envelope is { resource, restarted: true }"
  poll_until "$RES container replaced after restart" 60 worker_replaced "$before" || die "$RES container id unchanged after restart"
  poll_until "$RES logged 'worker started' after restart" 180 worker_logged_start
}

W5() { # restart with Tilt unreachable prints one TILT_NOT_RUNNING error envelope and exits 1
  log "W5 tdk restart with no Tilt on the port: one error envelope"
  common_error_envelope TILT_NOT_RUNNING restart "$RES" --port 1 --json
}

e2e_main "$@"
