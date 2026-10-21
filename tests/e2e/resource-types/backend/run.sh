#!/usr/bin/env bash
# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
# A backend resource in one language on a live stack (openspec task 3.5, #1290; restart and error envelope, #1294). The matrix runs this suite once per language,
# with LANGUAGE set to that language:
#
#   LANGUAGE=python tests/e2e/resource-types/backend/run.sh all      every case in order, then cleanup
#   tests/e2e/resource-types/backend/run.sh B1 B2 B3 B4 B5        single cases (LANGUAGE defaults to bun)
#
# Needs: flisk on PATH, Docker, Tilt, Node 22+, jq, curl.
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LANGUAGE="${LANGUAGE:-bun}"
FRAMEWORK="${FRAMEWORK:-}" # empty keeps the language's default framework
# shellcheck source=../../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
# shellcheck source=../common.sh
source "$SUITE_DIR/../common.sh"
e2e_init backend "backend-$LANGUAGE${FRAMEWORK:+-$FRAMEWORK}"
STACK=shop
API=api
RESOURCES=("$API")

api_healthy() { [ "$(traefik_request "$API" /health -o /dev/null -w '%{http_code}')" = "200" ]; }
api_container() { running_container "$API"; }

B1() { # scaffold a backend in the language under test
  log "B1 scaffold a $LANGUAGE backend${FRAMEWORK:+ with $FRAMEWORK}"
  common_scaffold backend "$API" --language "$LANGUAGE" ${FRAMEWORK:+--framework "$FRAMEWORK"} --stack "$STACK" --yes
  [ -d "$DIR/services/$STACK/$API" ] || die "scaffolded backend directory missing under services/$STACK/$API"
}

B2() { # flisk up, then the backend is listed as a backend in flisk status
  log "B2 flisk up and status lists $API as a $LANGUAGE backend"
  : >"$DIR/up.log"
  start_stack "$STACK"
  wait_status_url "$API"
  common_wait_status "$API" backend
}

B3() { # the routed health check answers 200 through Traefik
  log "B3 $API answers /health through Traefik"
  poll_until "$API answers /health 200 through Traefik" "$READY_TIMEOUT" api_healthy
}

B4() { # flisk restart, then the API answers /health again through Traefik
  log "B4 flisk restart $API"
  local before; before="$(api_container)"
  common_restart "$API" "$before" "$API answers /health 200 through Traefik" api_healthy
}

B5() { # restart with Tilt unreachable prints one TILT_NOT_RUNNING error envelope and exits 1
  log "B5 flisk restart with no Tilt on the port: one error envelope"
  common_error_envelope TILT_NOT_RUNNING restart "$API" --port 1 --json
}

e2e_main "$@"
