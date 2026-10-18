#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# Failure paths through a real tdk up (#1386). Both cases share one scratch project with a backend (bpapi) in stack app.
#   BP3 an unhealthy service: /health answers 503, so tdk up waits and then fails under the readiness policy, and its output
#       names the service.
#   BP4 an interrupted tdk up: the process is killed once Docker has started containers, tdk down removes them, and a second
#       tdk up brings the service up healthy.
# BP3 and BP4 each rebuild the scratch project, so run them one at a time (the default `all` runs them in order).
#
#   tests/e2e/journeys/broken-project/run.sh BP3
#   tests/e2e/journeys/broken-project/run.sh BP4
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init broken-project bpbroken
SERVICE=bpapi
RESOURCES=("$SERVICE")

# run_bounded <name> <seconds> <tdk args...>: run tdk in $DIR, streaming its output to the job log as it is produced (run
# keeps it in files until the command exits, which is why a hung tdk up showed nothing), and kill it after <seconds>. Sets RC
# (124 when killed). Output lands in $OUT/<name>.out and $OUT/<name>.err.
run_bounded() {
  local name="$1" secs="$2"; shift 2
  printf '$ (cd %s && tdk %s)  [bounded %ss]\n' "$DIR" "$*" "$secs"
  (cd "$DIR" && exec tdk "$@") >"$OUT/$name.out" 2>"$OUT/$name.err" &
  local pid=$! deadline=$((SECONDS + secs)) shown=0
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "::error::$name still running after ${secs}s; stopping it"
      # tdk starts Tilt and Docker helpers as children, so stop the children too, or the step keeps them running.
      pkill -TERM -P "$pid" 2>/dev/null || true
      kill -TERM "$pid" 2>/dev/null || true
      sleep 5
      pkill -KILL -P "$pid" 2>/dev/null || true
      kill -KILL "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      RC=124
      return 0
    fi
    # Every 60s, print what tdk has written so far (both streams), so the job log shows progress.
    if [ $((SECONDS / 60)) -gt "$shown" ]; then
      shown=$((SECONDS / 60))
      echo "[$name ${SECONDS}s] last output:"
      tail -n 20 "$OUT/$name.out" "$OUT/$name.err" 2>/dev/null || true
    fi
    sleep 5
  done
  set +e; wait "$pid"; RC=$?; set -e
  cat "$OUT/$name.out"
  [ -s "$OUT/$name.err" ] && { echo "[stderr]"; cat "$OUT/$name.err"; }
  echo "[exit $RC]"
}

# bp_diagnostics <name>: what a failing BP case needs in the job log: the tdk output, Docker containers, tdk status and the
# Tilt log for the project's containers.
bp_diagnostics() {
  echo "== diagnostics for $1"
  tail -n 200 "$OUT/$1.out" "$OUT/$1.err" 2>/dev/null || true
  docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
  (cd "$DIR" && tdk status --json 2>&1 | head -c 4000) || true
  docker ps -aq --filter "name=${PROJECT}-" | while read -r id; do
    echo "--- docker logs $id (tail)"; docker logs --tail 80 "$id" 2>&1 || true
  done
  [ -f "$DIR/up.log" ] && tail -n 200 "$DIR/up.log" || true
}

# scaffold_project: a fresh project with one backend whose /health is set by $1 ("ok" or "down").
scaffold_project() {
  rm -rf "$DIR"
  mkdir -p "$DIR"
  (cd "$DIR" && git init -q . && tdk project --yes >/dev/null 2>&1 && tdk resource "$SERVICE" --type backend --stack app --yes >/dev/null)
  local status_code=200 status_body=ok
  if [ "$1" = "down" ]; then status_code=503; status_body=down; fi
  cat >"$DIR/services/app/$SERVICE/src/index.ts" <<TS
import { Hono } from 'hono';

const app = new Hono();
app.get('/health', (c) => c.json({ status: '$status_body' }, $status_code));
app.get('/', (c) => c.text('ok'));

export default { port: process.env.PORT || 3000, fetch: app.fetch };
TS
}

BP3() { # an unhealthy service fails tdk up, and the output names it
  log "BP3 unhealthy service fails startup under the health policy and names the service"
  scaffold_project down
  # The readiness wait is bounded by TDK_UP_READY_TIMEOUT_MS; the whole call is bounded by run_bounded, so a hang fails
  # with its logs instead of running into the job timeout.
  (export TDK_UP_READY_TIMEOUT_MS=240000; run_bounded bp3-up 900 up app)
  if [ "$RC" -eq 124 ]; then
    bp_diagnostics bp3-up
    die "BP3: tdk up was still running after 900s; it did not exit after the readiness failure (see the log above)"
  fi
  [ "$RC" -ne 0 ] || { bp_diagnostics bp3-up; die "BP3: tdk up exited 0 with an unhealthy $SERVICE"; }
  grep -q "$SERVICE" "$OUT/bp3-up.out" "$OUT/bp3-up.err" 2>/dev/null \
    || die "BP3: tdk up output does not name $SERVICE"
  grep -Eq "✗ $SERVICE" "$OUT/bp3-up.out" "$OUT/bp3-up.err" 2>/dev/null \
    || die "BP3: no failure line for $SERVICE in tdk up output"
  run bp3-down down
  log "PASS BP3: tdk up exited $RC and named $SERVICE"
}

BP4() { # an interrupted tdk up is cleaned up by tdk down, and a second tdk up succeeds
  log "BP4 interrupted tdk up, tdk down cleans up, second tdk up succeeds"
  scaffold_project ok
  start_stack app
  poll_until "Docker has created a container for $SERVICE" "$READY_TIMEOUT" \
    bash -c "docker ps -aq --filter 'name=${PROJECT}-' | grep -q ."
  # Interrupt: kill the tdk process that owns this run. Its Tilt child may survive, which is the state tdk down must clear.
  pkill -KILL -f "bin/tdk.js up app" >/dev/null 2>&1 || true

  run bp4-down down
  [ "$RC" -eq 0 ] || die "BP4: tdk down exited $RC after an interrupted up"
  poll_until "no containers left for $PROJECT after tdk down" 120 \
    bash -c "! docker ps -aq --filter 'name=${PROJECT}-' | grep -q ."

  start_stack app
  wait_status_url "$SERVICE"
  (cd "$DIR" && tdk status --json) | jq -e --arg n "$SERVICE" '.data.resources[] | select(.name==$n)' >/dev/null \
    || die "BP4: tdk status --json does not list $SERVICE after the second tdk up"
  run bp4-down-final down
  log "PASS BP4: tdk down cleaned up after an interrupted up, and a second tdk up started $SERVICE"
}

e2e_main "$@"
