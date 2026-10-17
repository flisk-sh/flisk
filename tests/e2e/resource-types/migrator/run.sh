#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# A migrator resource on a live stack (openspec task 3.6, #1290). Runs nightly, on release and by hand; see suite.json.
# The ordering rule (Postgres, then migrator, then API, proven through tdk up) needs an API in the project; that check is the
# follow-up to this suite, so these cases prove the resource scaffolds and starts only.
#
#   tests/e2e/resource-types/migrator/run.sh all              every case in order, then cleanup
#   tests/e2e/resource-types/migrator/run.sh M1 M2            single cases
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
# shellcheck source=../common.sh
source "$SUITE_DIR/../common.sh"
e2e_init migrator migrator
STACK=shop
RES=migrator
RESOURCES=("$RES")

M1() { # scaffold the migrator in a project
  log "M1 scaffold a migrator"
  common_scaffold migrator "$RES" --stack "$STACK" --yes
}

M2() { # tdk up, then the migrator is listed as a migrator in tdk status
  log "M2 tdk up and status lists $RES as a migrator"
  : >"$DIR/up.log"
  start_stack "$STACK"
  wait_status_url "$RES"
  common_wait_status "$RES" migrator
}

e2e_main "$@"
