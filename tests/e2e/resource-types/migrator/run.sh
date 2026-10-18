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

API=api
MIGRATOR="$API-migrator"
# The migrator's and the API's scaffold live in this stack; cleanup removes both with the rest of the project.
RESOURCES+=("$API" "$MIGRATOR")

# container_named <resource> [running|exited]: the newest container for <resource> in this stack. Matched exactly, so api does
# not match api-migrator (Tilt names containers <project>-<stack>-<resource>-<n>).
container_named() {
  docker ps -a --format '{{.ID}} {{.Names}} {{.State}}' | awk -v p="${PROJECT}-${STACK}-$1-" -v s="${2:-}" \
    'index($2, p) == 1 && substr($2, length(p) + 1) ~ /^[0-9]+$/ && (s == "" || $3 == s) { print $1; exit }'
}
api_running() { [ -n "$(container_named "$API" running)" ]; }
migrator_exited() { [ -n "$(container_named "$MIGRATOR" exited)" ]; }

M3() { # tdk up starts Postgres, runs the migrator to completion, then starts the API; the API does not migrate
  log "M3 tdk up: Postgres, then the migrator, then the API"
  common_scaffold backend "$API" --feature prisma --stack "$STACK" --yes
  local api_json="$DIR/services/$STACK/$API/service.json" mig_json="$DIR/services/$STACK/$MIGRATOR/service.json"
  jq -e --arg m "$MIGRATOR" '.dependsOn == [$m]' "$api_json" >/dev/null || die "$API does not depend on $MIGRATOR"
  jq -e '.dependsOn == ["postgres"]' "$mig_json" >/dev/null || die "$MIGRATOR does not depend on postgres"
  if [ "${M3_BREAK:-}" = "1" ]; then
    # The deliberate break: the API drops its migrator dependency, so nothing orders it after the migrator.
    jq '.dependsOn = []' "$api_json" >"$api_json.tmp" && mv "$api_json.tmp" "$api_json"
    echo "M3_BREAK=1: $API dependsOn is now []"
  fi
  : >"$DIR/up.log"
  start_stack "$STACK"
  poll_until "a finished $MIGRATOR container" "$READY_TIMEOUT" migrator_exited
  poll_until "a running $API container" "$READY_TIMEOUT" api_running
  local mig api
  mig="$(container_named "$MIGRATOR" exited)"
  api="$(container_named "$API" running)"
  [ "$(docker inspect -f '{{.State.ExitCode}}' "$mig")" = "0" ] || die "$MIGRATOR exited non-zero"
  local mig_done api_start
  mig_done="$(node -p "Date.parse('$(docker inspect -f '{{.State.FinishedAt}}' "$mig")')")"
  api_start="$(node -p "Date.parse('$(docker inspect -f '{{.State.StartedAt}}' "$api")')")"
  echo "$MIGRATOR finished at $(docker inspect -f '{{.State.FinishedAt}}' "$mig"); $API started at $(docker inspect -f '{{.State.StartedAt}}' "$api")"
  [ "$mig_done" -le "$api_start" ] || die "$API started before $MIGRATOR finished (ordering broken)"
}

e2e_main "$@"
