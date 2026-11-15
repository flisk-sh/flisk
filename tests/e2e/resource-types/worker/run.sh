#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# A worker resource on a live stack (openspec task 3.6, #1290; restart, error envelope and a processed job, #1294). Runs nightly, on release and by hand; see suite.json.
#
#   tests/e2e/resource-types/worker/run.sh all              every case in order, then cleanup
#   tests/e2e/resource-types/worker/run.sh W1 W2 W6         single cases
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

W2() { # flisk up, then the worker is listed as a worker in flisk status
  log "W2 flisk up and status lists $RES as a worker"
  : >"$DIR/up.log"
  start_stack "$STACK"
  # A worker serves no route, so flisk status gives it no Traefik url; wait for its status entry, not for a url.
  common_wait_status "$RES" worker
}

# The scaffolded worker is a stub that logs one line and exits, so its container may already have stopped: read the logs of
# the newest container for the resource, running or not, and bound the wait.
worker_container() { docker ps -aq --filter "name=${PROJECT}-.*-$RES-" | head -1; }
worker_logged_start() { local c; c="$(worker_container)"; [ -n "$c" ] && docker logs "$c" 2>&1 | grep -q "$RES worker started"; }

W3() { # the worker's container logged its start line
  log "W3 the $RES container logged its start line"
  poll_until "$RES logged 'worker started'" 180 worker_logged_start
  timing_serving cold_start || true # a worker serves no route: its start is the start line in its log
}

W3b() { # flisk down, then flisk up again with the images cached: the worker logs its start line again (the warm start)
  log "W3b warm start: flisk down, flisk up, $RES logs its start line"
  common_warm_start "$STACK" "$RES logged 'worker started' (warm)" worker_logged_start
}

W4() { # flisk restart starts the existing worker container again, with no new image
  log "W4 flisk restart $RES"
  local before started_before logs_before now started_after
  before="$(worker_container)"
  [ -n "$before" ] || die "no $RES container before the restart"
  started_before="$(docker inspect -f '{{.State.StartedAt}}' "$before")" || die "could not inspect $RES before restart"
  [ -n "$started_before" ] || die "missing StartedAt for $RES before restart"
  logs_before="$(worker_start_count "$before")"
  run restart-"$RES" restart "$RES" --json
  [ "$RC" -eq 0 ] || die "flisk restart $RES exited $RC"
  assert envelope "$OUT/restart-$RES.out"
  assert check "$OUT/restart-$RES.out" "j.errors.length === 0 && j.data.resource === '$RES' && j.data.restarted === true" "restart envelope is { resource, restarted: true }"
  # #4192: `docker restart` keeps the container id while advancing StartedAt and logging a fresh start line.
  now="$(worker_container)"
  [ -n "$now" ] && [ "$now" = "$before" ] || die "$RES container was replaced by the restart: expected $before, got ${now:-none}"
  started_after="$(docker inspect -f '{{.State.StartedAt}}' "$before")" || die "could not inspect $RES after restart"
  [ -n "$started_after" ] && [ "$started_after" != "$started_before" ] || die "$RES did not restart: StartedAt is unchanged or missing"
  poll_until "$RES logged 'worker started' after restart" "${WORKER_LOG_TIMEOUT:-180}" worker_logged_new_start "$before" "$logs_before"
}

worker_start_count() {
  local count
  count="$(docker logs "$1" 2>&1 | grep -c "$RES worker started" || true)"
  printf '%s
' "${count:-0}"
}

worker_logged_new_start() { # <container id> <start-line count before restart>: a new start line appeared after restart
  [ "$(worker_start_count "$1")" -gt "$2" ]
}

W5() { # restart with Tilt unreachable prints one TILT_NOT_RUNNING error envelope and exits 1
  log "W5 flisk restart with no Tilt on the port: one error envelope"
  common_error_envelope TILT_NOT_RUNNING restart "$RES" --port 1 --json
}

worker_processed_job() { local c; c="$(worker_container)"; [ -n "$c" ] && docker logs "$c" 2>&1 | grep -q "Job completed: demo-1"; }

W6() { # the worker's newest container processed the demo job the scaffold hands out on its first poll
  log "W6 the $RES container processed a job"
  poll_until "$RES logged 'Job completed: demo-1'" 180 worker_processed_job
}

e2e_main "$@"
