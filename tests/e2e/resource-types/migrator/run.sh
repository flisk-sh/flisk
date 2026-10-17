#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# A migrator resource (openspec task 3.6, #1290). `tdk resource --type migrator` is not accepted: a migrator is a service.json with
# "appType": "migrator" that `tdk resource <name>` registers, the same route as an sdk. So M1 writes that service.json and
# registers it, and M2 checks `tdk status` lists it as a migrator. Neither needs a stack. The ordering rule (Postgres, then the
# migrator, then the API, proven through tdk up) needs an API in the project and is the follow-up to this suite.
# Runs nightly, on release and by hand; see suite.json.
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
RES=migrate
RESOURCES=("$RES")

M1() { # write the migrator's service.json and register it
  log "M1 register a migrator from its service.json"
  rm -rf "$DIR"; mkdir -p "$DIR"
  (cd "$DIR" && git init -q .)
  run scaffold-project project --yes
  [ "$RC" -eq 0 ] || die "tdk project --yes exited $RC"
  mkdir -p "$DIR/services/$STACK/$RES"
  printf '{"appName":"%s","appType":"migrator"}\n' "$RES" >"$DIR/services/$STACK/$RES/service.json"
  run "register-$RES" resource "$RES" --stack "$STACK" --yes
  [ "$RC" -eq 0 ] || die "tdk resource $RES (register existing) exited $RC"
  jq -e '.appType == "migrator"' "$DIR/services/$STACK/$RES/service.json" >/dev/null || die "registering changed the appType"
}

M2() { # tdk status lists the registered resource as a migrator
  log "M2 tdk status lists $RES as a migrator"
  common_wait_status "$RES" migrator
}

e2e_main "$@"
