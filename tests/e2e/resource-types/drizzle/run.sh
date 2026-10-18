#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# A backend with the drizzle feature on a live stack (#1488). The scaffold enables `tdk resource --feature drizzle`; the API
# gets DATABASE_URL from the platform Postgres and answers /health/db through Traefik by querying Postgres with Drizzle:
#
#   tests/e2e/resource-types/drizzle/run.sh all          every case in order, then cleanup
#   tests/e2e/resource-types/drizzle/run.sh D1 D2 D3     single cases
#   tests/e2e/resource-types/drizzle/run.sh list | self-check | diagnostics | cleanup
#
# Needs: tdk on PATH, Docker, Tilt, Node 22+, jq, curl.
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
# shellcheck source=../common.sh
source "$SUITE_DIR/../common.sh"
e2e_init drizzle drizzlee2e
STACK=shop
API=api
RESOURCES=("$API")

api_container() { running_container "$API"; }
api_db_healthy() { [ "$(traefik_request "$API" /health/db -o /dev/null -w '%{http_code}')" = "200" ]; }

D1() { # scaffold a backend with the drizzle feature
  log "D1 scaffold a backend with --feature drizzle"
  common_scaffold backend "$API" --feature drizzle --stack "$STACK" --yes
  [ -d "$DIR/services/$STACK/$API" ] || die "scaffolded backend directory missing under services/$STACK/$API"
  grep -rq "drizzle-orm" "$DIR/services/$STACK/$API" || die "no drizzle-orm dependency in the scaffolded backend"
}

D2() { # tdk up, then the backend is listed as a backend in tdk status
  log "D2 tdk up and status lists $API as a backend with drizzle"
  : >"$DIR/up.log"
  start_stack "$STACK"
  wait_status_url "$API"
  common_wait_status "$API" backend
}

D3() { # DATABASE_URL is set in the running container's environment
  log "D3 DATABASE_URL is set in the $API container"
  local cid; cid="$(api_container)"; [ -n "$cid" ] || die "no running $API container"
  local env; env="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$cid")"
  echo "$env" | grep -E '^DATABASE_URL=postgres(ql)?://' >"$OUT/d3-env.out" || die "DATABASE_URL is not set to a postgres URL in $cid"
  echo "DATABASE_URL is set (value not printed)"
}

D4() { # /health/db answers 200 through Traefik: the route queried Postgres through Drizzle
  log "D4 $API answers /health/db through Traefik"
  poll_until "$API answers /health/db 200 through Traefik" "$READY_TIMEOUT" api_db_healthy
  local body; body="$(traefik_request_ok "$API" /health/db)"; echo "GET /health/db -> $body"
  echo "$body" >"$OUT/d4-health-db.out"
  assert check "$OUT/d4-health-db.out" "j.ok === true || j.status === 'ok'" "/health/db reports the Postgres query succeeded"
}

D5() { # tdk restart, then /health/db answers 200 again through Traefik
  log "D5 tdk restart $API"
  local before; before="$(api_container)"
  common_restart "$API" "$before" "$API answers /health/db 200 through Traefik" api_db_healthy
}

D6() { # restart with Tilt unreachable prints one TILT_NOT_RUNNING error envelope and exits 1
  log "D6 tdk restart with no Tilt on the port: one error envelope"
  common_error_envelope TILT_NOT_RUNNING restart "$API" --port 1 --json
}

e2e_main "$@"
