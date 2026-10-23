#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The combined leg (#1290): an agent and a worker boot in one stack, so a regression that only shows when two resource types
# share a Tiltfile, a Compose project or a focus list fails here. Runs nightly, on release and by hand; see suite.json.
#
#   tests/e2e/resource-types/combined/run.sh <case> [<case> ...]   e.g.  run.sh X1 X2
#   tests/e2e/resource-types/combined/run.sh all                   every case in order, then cleanup
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
# shellcheck source=../common.sh
source "$SUITE_DIR/../common.sh"
e2e_init combined combinede2e
STACK=shop
AGENT=bot
WORKER=worker
RESOURCES=("$AGENT" "$WORKER")

both_listed() { common_listed "$AGENT" agent && common_listed "$WORKER" worker; }
worker_container() { docker ps -aq --filter "name=${PROJECT}-.*-$WORKER-" | head -1; }
worker_logged_start() { local c; c="$(worker_container)"; [ -n "$c" ] && docker logs "$c" 2>&1 | grep -q "$WORKER worker started"; }
agent_ready() { [ "$(traefik_request "$AGENT" /ready -o /dev/null -w '%{http_code}')" = "200" ]; }

X1() { # one project, the agent and the worker scaffolded into it
  log "X1 scaffold an agent and a worker in one project"
  rm -rf "$DIR"; mkdir -p "$DIR"
  (cd "$DIR" && git init -q .)
  run "scaffold-project" project --yes
  [ "$RC" -eq 0 ] || die "flisk project --yes exited $RC"
  run "scaffold-$AGENT" resource "$AGENT" --type agent --stack "$STACK" --yes
  [ "$RC" -eq 0 ] || die "flisk resource $AGENT --type agent exited $RC"
  run "scaffold-$WORKER" resource "$WORKER" --type worker --stack "$STACK" --yes
  [ "$RC" -eq 0 ] || die "flisk resource $WORKER --type worker exited $RC"
}

X2() { # flisk up, then both resources are listed with their types
  log "X2 flisk up and status lists both resources"
  : >"$DIR/up.log"
  start_stack "$STACK"
  poll_until "$AGENT listed as agent and $WORKER as worker" "${READY_TIMEOUT:-120}" both_listed
  run x2-status status --json
  assert check "$OUT/x2-status.out" "j.errors.length === 0 && j.data.resources.some(r => r.name === '$AGENT' && r.type === 'agent') && j.data.resources.some(r => r.name === '$WORKER' && r.type === 'worker')" "flisk status --json lists $AGENT as agent and $WORKER as worker"
}

X3() { # the worker's container logged its start line while the agent was up
  log "X3 the $WORKER container logged its start line"
  poll_until "$WORKER logged 'worker started'" 180 worker_logged_start
}

X4() { # the agent answers /ready 200 through Traefik at the same time
  log "X4 the $AGENT answers /ready 200 through Traefik"
  poll_until "agent $AGENT answers /ready 200 through Traefik" "$READY_TIMEOUT" agent_ready
}

e2e_main "$@"
