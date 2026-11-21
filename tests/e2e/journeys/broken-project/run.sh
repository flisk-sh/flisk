#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Failure paths through a real flisk up (#1386). Both cases share one scratch project with a backend (bpapi) in stack app.
#   BP3 an unhealthy service: /health answers 503. flisk up reports "✗ bpapi failed" with the failing health check and keeps
#       Tilt running, so the case waits for that report, then runs flisk down.
#   BP4 an interrupted flisk up: the process is killed once Docker has started containers, flisk down removes them, and a second
#       flisk up brings the service up healthy.
#   BP5 external project compose network (#3992): messaging compose declares <project>_traefik-private external, init-networks
#       creates it automatically, and flisk up starts both nats and the app cleanly.
# BP3, BP4 and BP5 each rebuild the scratch project, so run them one at a time (the default `all` runs them in order).
# Expected total duration: under 180s (suite.json typicalSeconds). Each case logs its own wall time.
#
#   tests/e2e/journeys/broken-project/run.sh BP3
#   tests/e2e/journeys/broken-project/run.sh BP4
#   tests/e2e/journeys/broken-project/run.sh BP5
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init broken-project bpbroken
RC=0 # set by run and run_in; a default keeps `set -u` from failing before the first command
SERVICE=bpapi
RESOURCES=("$SERVICE")

# bp_diagnostics <name>: what a failing BP case needs in the job log: the flisk output, Docker containers, flisk status and the
# Tilt log for the project's containers.
bp_diagnostics() {
  echo "== diagnostics for $1"
  tail -n 200 "$OUT/$1.out" "$OUT/$1.err" 2>/dev/null || true
  docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
  (cd "$DIR" && flisk status --json 2>&1 | head -c 4000) || true
  docker ps -aq --filter "name=${PROJECT}-" | while read -r id; do
    echo "--- docker logs $id (tail)"; docker logs --tail 80 "$id" 2>&1 || true
  done
  [ -f "$DIR/up.log" ] && tail -n 200 "$DIR/up.log" || true
}

# scaffold_project: a fresh project with one backend whose /health is set by $1 ("ok" or "down").
scaffold_project() {
  rm -rf "$DIR"
  mkdir -p "$DIR"
  (cd "$DIR" && git init -q . && flisk project --yes >/dev/null 2>&1 && flisk resource "$SERVICE" --type backend --stack app --yes >/dev/null)
  local status_code=200 status_body=ok
  if [ "$1" = "down" ]; then status_code=503; status_body=down; fi
  cat >"$DIR/services/app/$SERVICE/src/index.ts" <<TS
import { Hono } from 'hono';

const app = new Hono();
app.get('/health', (c) => c.json({ status: '$status_body' }, $status_code));
app.get('/', (c) => c.text('ok'));

export default { port: process.env.PORT || 3000, fetch: app.fetch };
TS
  # The scaffolded backend otherwise waits 30s before counting health failures and needs three failures 30s apart, so BP3
  # spent the whole ready timeout before Docker called the container unhealthy. Probe every 2s with one retry instead.
  # startPeriod must be positive, so 1 is the smallest allowed value: effectively no warm-up before failures count.
  local manifest="$DIR/services/app/$SERVICE/service.json"
  jq '.healthCheck = {
    "interval": 2,
    "timeout": 2,
    "retries": 1,
    "startPeriod": 1
  }' "$manifest" >"$manifest.tmp"
  mv "$manifest.tmp" "$manifest"
}

BP3() { # an unhealthy service: flisk up reports the failing health check and keeps Tilt running, so wait for the report
  local case_start=$SECONDS
  log "BP3 unhealthy service fails startup under the health policy and names the service"
  scaffold_project down
  # flisk up does not exit after a readiness failure: it prints the failure and leaves Tilt running for inspection (the
  # 2026-10-18 CI run showed "✗ bpapi failed: container is running, but its health check is failing"). So this case
  # starts flisk up in the background, streams its output, waits for that line, and then runs flisk down.
  # The fixture now turns unhealthy in seconds; 60s leaves room for a cold build and still reports the failing health
  # check, without waiting out the old 240s timeout.
  (cd "$DIR" && FLISK_UP_READY_TIMEOUT_MS=60000 nohup flisk up app >"$OUT/bp3-up.out" 2>"$OUT/bp3-up.err" &)
  local deadline=$((SECONDS + 900)) shown=0
  until grep -q "✗ $SERVICE failed" "$OUT/bp3-up.out" "$OUT/bp3-up.err" 2>/dev/null; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      bp_diagnostics bp3-up
      die "BP3: flisk up did not report a failed $SERVICE within 900s"
    fi
    if [ $((SECONDS / 60)) -gt "$shown" ]; then
      shown=$((SECONDS / 60))
      echo "[bp3-up ${SECONDS}s] last output:"
      tail -n 20 "$OUT/bp3-up.out" "$OUT/bp3-up.err" 2>/dev/null || true
    fi
    sleep 5
  done
  echo "[bp3-up ${SECONDS}s] failure reported:"
  grep -h "$SERVICE" "$OUT/bp3-up.out" "$OUT/bp3-up.err" || true
  grep -q "health check is failing" "$OUT/bp3-up.out" "$OUT/bp3-up.err" \
    || { bp_diagnostics bp3-up; die "BP3: the $SERVICE failure does not say the health check is failing"; }
  run bp3-down down
  [ "$RC" -eq 0 ] || die "BP3: flisk down exited $RC after the failed startup"
  log "BP3 took $((SECONDS - case_start))s"
  log "PASS BP3: flisk up reported $SERVICE failing its health check, and flisk down cleaned up"
}

BP4() { # an interrupted flisk up is cleaned up by flisk down, and a second flisk up succeeds
  local case_start=$SECONDS
  log "BP4 interrupted flisk up, flisk down cleans up, second flisk up succeeds"
  scaffold_project ok
  start_stack app
  poll_until "Docker has created a container for $SERVICE" "$READY_TIMEOUT" \
    bash -c "docker ps -aq --filter 'name=${PROJECT}-' | grep -q ."
  # Interrupt: kill the flisk process that owns this run. Its Tilt child may survive, which is the state flisk down must clear.
  pkill -KILL -f "bin/flisk.js up app" >/dev/null 2>&1 || true

  run bp4-down down
  [ "$RC" -eq 0 ] || die "BP4: flisk down exited $RC after an interrupted up"
  poll_until "no containers left for $PROJECT after flisk down" 120 \
    bash -c "! docker ps -aq --filter 'name=${PROJECT}-' | grep -q ."

  start_stack app
  wait_status_url "$SERVICE"
  (cd "$DIR" && flisk status --json) | jq -e --arg n "$SERVICE" '.data.resources[] | select(.name==$n)' >/dev/null \
    || die "BP4: flisk status --json does not list $SERVICE after the second flisk up"
  run bp4-down-final down
  log "BP4 took $((SECONDS - case_start))s"
  log "PASS BP4: flisk down cleaned up after an interrupted up, and a second flisk up started $SERVICE"
}

BP5() { # a project compose file declaring <project>_traefik-private external starts cleanly because init-networks creates it (#3992)
  log "BP5 project compose declaring <project>_traefik-private external is initialized by init-networks"
  scaffold_project ok
  local proj_prefix="${PROJECT//-/_}"
  local ext_net="${proj_prefix}_traefik-private"
  docker network rm "$ext_net" >/dev/null 2>&1 || true
  mkdir -p "$DIR/services/platform/messaging"
  cat >"$DIR/services/platform/messaging/docker-compose.yml" <<YAML
services:
  nats:
    image: nats:2-alpine
    command: ["-js"]
    networks:
      - traefik-private

networks:
  traefik-private:
    name: ${ext_net}
    external: true
YAML
  start_stack app
  wait_status_url "$SERVICE"
  # `flisk up` spends seconds in preflight and generation before Tilt starts init-networks, and
  # wait_status_url passes as soon as status lists the URL (the field is derived from the manifest,
  # not from a running stack), so a single inspect here races the up and fails before Tilt even
  # started. Poll for the network until the ready timeout instead.
  poll_until "init-networks creates $ext_net" "$READY_TIMEOUT" \
    bash -c "docker network inspect '$ext_net' >/dev/null 2>&1" \
    || { bp_diagnostics bp5; die "BP5: init-networks did not create external network $ext_net"; }
  run bp5-down down --prune-networks
  [ "$RC" -eq 0 ] || die "BP5: flisk down --prune-networks exited $RC"
  log "PASS BP5: init-networks created $ext_net and flisk up started the stack cleanly"
}

e2e_main "$@"
