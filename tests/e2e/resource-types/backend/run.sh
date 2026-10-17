#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# A backend resource in one language on a live stack (openspec task 3.5, #1290). The matrix runs this suite once per language,
# with LANGUAGE set to that language:
#
#   LANGUAGE=python tests/e2e/resource-types/backend/run.sh all      every case in order, then cleanup
#   tests/e2e/resource-types/backend/run.sh B1 B2 B3                 single cases (LANGUAGE defaults to bun)
#
# Needs: tdk on PATH, Docker, Tilt, Node 22+, jq, curl.
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LANGUAGE="${LANGUAGE:-bun}"
# shellcheck source=../../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
# shellcheck source=../common.sh
source "$SUITE_DIR/../common.sh"
e2e_init backend "backend-$LANGUAGE"
STACK=shop
API=api
RESOURCES=("$API")

api_healthy() { [ "$(traefik_request "$API" /health -o /dev/null -w '%{http_code}')" = "200" ]; }

B1() { # scaffold a backend in the language under test
  log "B1 scaffold a $LANGUAGE backend"
  common_scaffold backend "$API" --language "$LANGUAGE" --stack "$STACK" --yes
  [ -d "$DIR/services/$STACK/$API" ] || die "scaffolded backend directory missing under services/$STACK/$API"
}

B2() { # tdk up, then the backend is listed as a backend in tdk status
  log "B2 tdk up and status lists $API as a $LANGUAGE backend"
  : >"$DIR/up.log"
  start_stack "$STACK"
  wait_status_url "$API"
  common_wait_status "$API" backend
}

B3() { # the routed health check answers 200 through Traefik
  log "B3 $API answers /health through Traefik"
  poll_until "$API answers /health 200 through Traefik" "$READY_TIMEOUT" api_healthy
}

e2e_main "$@"
