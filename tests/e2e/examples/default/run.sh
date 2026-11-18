#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The bundled product example on a clean runner (moved from the retired example-e2e workflow, #1299). Each case is one step of the old workflow, with the
# same logic: D1 builds and packs the candidate CLI, D2 installs the tarball globally, D3 clones and configures the example, and D4
# boots it with flisk up and proves the routed worker write path. The example stays at $REPO_ROOT/flisk-example, where the workflow's
# diagnostics and stop steps look for it. The workflow keeps its setup steps (Bun, Tilt, free ports) and its diagnostics.
#
#   tests/e2e/examples/default/run.sh D1 D2 D3 D4    the four steps in order
#   tests/e2e/examples/default/run.sh self-check     every case in suite.json is defined
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
RUNNER_TEMP="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
e2e_init default flisk-example
DIR="$REPO_ROOT/flisk-example"
# The example lives in the checkout, not in the scratch space, so the default cleanup only stops it: it never removes a directory
# the checkout owns.
e2e_cleanup() { [ -d "$DIR" ] && (cd "$DIR" && flisk down >/dev/null 2>&1 || true); }

D1() { # build and pack the candidate Flisk package
  log "D1 build and pack the candidate Flisk package"
  cd "$REPO_ROOT"
  bun install --frozen-lockfile
  npm run build
  npm pack --pack-destination "$RUNNER_TEMP"
}

D2() { # pack and install the candidate Flisk package
  log "D2 pack and install the candidate Flisk package"
  cd "$REPO_ROOT"
  tarball="$(npm pack --silent | tail -1)"
  node scripts/install-global.mjs "./$tarball"
}

D3() { # clone and configure the bundled example
  log "D3 clone and configure the bundled example"
  cd "$REPO_ROOT"
  flisk project example --path flisk-example
  cd flisk-example
  flisk project --yes
  # The product example intentionally uses only PostgreSQL and NATS.
  # Keep its scaffold from enabling optional Infisical resources.
  sed -i 's/^INFISICAL_ENABLED=.*/INFISICAL_ENABLED=false/' .env
  flisk doctor --no-ping
  flisk config verify
}

D4() { # boot, health check, and prove the routed worker write path
  log "D4 boot, health check, and prove the routed worker write path"
  # The subshell scopes the cleanup trap to this case: it collects logs on failure and always tears the stack down.
  (
    cd "$DIR"
    set -euo pipefail
    flisk_pid=""
    cleanup() {
      status=$?
      if [ "$status" -ne 0 ]; then
        echo "Example E2E failed; collecting container and NATS logs before teardown"
        tail -160 up.log 2>/dev/null || true
        jq '{errors, ports: .data.ports}' doctor.json 2>/dev/null || true
        docker ps -a --format 'table {{.Names}}\t{{.Status}}' || true
        docker logs flisk_example_nats 2>&1 | tail -200 || true
        tilt get uiresources -o json 2>&1 | jq -r '.items[] | "\(.metadata.name): update=\(.status.updateStatus // "-") runtime=\(.status.runtimeStatus // "-") error=\((.status.buildHistory // [] | map(.error // empty) | first) // "-")"' || true
      fi
      [ -n "$flisk_pid" ] && kill "$flisk_pid" 2>/dev/null || true
      flisk down >/dev/null 2>&1 || true
      return "$status"
    }
    trap cleanup EXIT

    # A transient infrastructure fault during bring-up (seen in the merge queue as
    # "docker compose up traefik ... exit status 1") leaves Traefik unbound, so nothing answers on the
    # ingress port and every readiness curl fails. Retry the whole bring-up once before giving up; a
    # persistent fault still fails the case.
    http_port=""
    api=""
    app=""
    booted=false
    for boot_attempt in 1 2; do
      flisk up shop > up.log 2>&1 &
      flisk_pid=$!

      tilt_up=false
      for _ in $(seq 1 75); do
        if grep -q 'Running tilt up' up.log; then tilt_up=true; break; fi
        if ! kill -0 "$flisk_pid" 2>/dev/null; then break; fi
        sleep 2
      done
      if [ "$tilt_up" != true ]; then
        echo "flisk up did not reach 'Running tilt up' on attempt $boot_attempt"
        tail -120 up.log 2>/dev/null || true
        kill "$flisk_pid" 2>/dev/null || true
        flisk down >/dev/null 2>&1 || true
        sleep 3
        continue
      fi

      # Flisk chooses ingress ports from the available host ports and saves the selected plan. Read the
      # public machine-readable doctor report instead of assuming Traefik is bound to port 80.
      doctor_status=0
      flisk doctor --json > doctor.json || doctor_status=$?
      if [ "$doctor_status" -ne 0 ]; then
        echo "flisk doctor reported readiness findings while the example was starting; reading its saved port plan anyway."
      fi
      if ! http_port="$(jq -er '.data.ports.http.chosen | select(type == "number")' doctor.json)"; then
        echo "no chosen ingress port yet on attempt $boot_attempt"
        kill "$flisk_pid" 2>/dev/null || true
        flisk down >/dev/null 2>&1 || true
        sleep 3
        continue
      fi
      api="http://api.flisk-example.localhost:${http_port}/api/orders"
      app="http://app.flisk-example.localhost:${http_port}/orders-app/"

      ready=false
      for _ in $(seq 1 90); do
        if curl -fsS "$api/health" >/dev/null 2>&1 && curl -fsS "$api/worker-ready" >/dev/null 2>&1 && curl -fsS "$app" >/dev/null 2>&1; then ready=true; break; fi
        sleep 2
      done
      if [ "$ready" = true ]; then booted=true; break; fi

      # On the last attempt, leave the stack up so the cleanup trap can still collect container and NATS
      # logs for a genuine (non-transient) failure; only tear down between attempts to retry cleanly.
      if [ "$boot_attempt" -lt 2 ]; then
        echo "The example stack did not become reachable on attempt $boot_attempt (Traefik may have failed to bind); retrying the bring-up."
        tilt get uiresources -o json 2>&1 | jq -r '.items[] | "\(.metadata.name): update=\(.status.updateStatus // "-") runtime=\(.status.runtimeStatus // "-") error=\((.status.buildHistory // [] | map(.error // empty) | first) // "-")"' || true
        kill "$flisk_pid" 2>/dev/null || true
        flisk down >/dev/null 2>&1 || true
        sleep 3
      fi
    done

    if [ "$booted" != true ]; then
      echo "The example stack never became reachable after retrying the bring-up" >&2
      exit 1
    fi

    curl -fsS "$api/health" >/dev/null
    curl -fsS "$api/worker-ready" >/dev/null
    curl -fsS "$app" >/dev/null

    curl -fsS -X POST "$api" -H 'content-type: application/json' \
      -d '{"item":"CI coffee"}' -o "$RUNNER_TEMP/order.json"
    order_id="$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).order.id))' "$RUNNER_TEMP/order.json")"
    echo "Created order $order_id through Traefik"

    observed=false
    for _ in $(seq 1 60); do
      result="$(curl -fsS "$api/$order_id")"
      seen="$(printf '%s' "$result" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).order.workerSeenAt ? "yes" : "no"))')"
      if [ "$seen" = yes ]; then observed=true; break; fi
      sleep 1
    done
    if [ "$observed" != true ]; then
      echo "Worker did not observe order $order_id" >&2
      docker logs flisk_example_nats || true
      tail -120 up.log
      exit 1
    fi
    echo "NATS worker observed order $order_id"
    flisk config verify
  )
}

e2e_main "$@"
