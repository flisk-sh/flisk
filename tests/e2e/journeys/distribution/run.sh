#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Getting an app to its users, with the packed CLI of the checkout (install: true in suite.json). Runs on a pull request only when
# the distribution commands or this suite change (suite.json paths), and nightly.
#   DS1 flisk project --list --json lists the launch, portal and fullstack starters, each pinned to a commit
#   DS2 a fresh project with an mcp resource
#   DS3 flisk distribute status --init, status --json and board --json (6 stages by the six Zachman questions)
#   DS4 flisk distribute kit <mcp resource> --dry-run prints the kit and writes nothing
#   DS5 flisk export render --dry-run and flisk export wrangler --resource <mcp resource> --dry-run write nothing (npx fetches
#       @flisk-sh/flisk-export, so this needs network access)
#   DS6 flisk up, then flisk mcp check <mcp resource> (list-only, no --call) passes, in human and --json form
#
#   tests/e2e/journeys/distribution/run.sh DS1 DS2 DS3 DS4 DS5 DS6
# Needs: flisk on PATH, Node 22+ (npx), jq, curl; DS6 also Docker and Tilt.
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init distribution distre2e
STACK=app
RES=tools
RESOURCES=("$RES")

# Every file in the project with its checksum (node_modules and the stack log left out), to prove a dry run wrote nothing.
snapshot() { (cd "$DIR" && find . -type f -not -path './node_modules/*' -not -name up.log -exec cksum {} + | LC_ALL=C sort); }
expect_unchanged() { # <snapshot before> <what ran>
  local after; after="$(snapshot)"
  [ "$1" = "$after" ] || { diff <(printf '%s\n' "$1") <(printf '%s\n' "$after") >&2 || true; die "$2 changed files in the project"; }
}

DS1() {
  log "DS1 flisk project --list --json lists launch, portal and fullstack, each with a ref"
  mkdir -p "$SUITE_ROOT/list"
  run_in "$SUITE_ROOT/list" project-list project --list --json >/dev/null
  [ "$RC" -eq 0 ] || die "flisk project --list --json exited $RC"
  local key
  for key in launch portal fullstack; do
    jq -e --arg k "$key" '.[] | select(.key == $k) | (.repo | startswith("https://github.com/")) and (.ref | test("^[0-9a-f]{40}$")) and (.description | length > 0)' \
      "$OUT/project-list.out" >/dev/null || die "flisk project --list --json has no $key entry with a repo, a 40-character ref and a description"
  done
  jq -e 'type == "array" and all(.[]; (.key | type) == "string" and (.repo | type) == "string")' "$OUT/project-list.out" >/dev/null \
    || die "flisk project --list --json is not an array of {key, repo, ...}"
}

DS2() {
  log "DS2 a fresh project with an mcp resource"
  rm -rf "$DIR"; mkdir -p "$DIR"
  (cd "$DIR" && git init -q .)
  run project project --yes >/dev/null
  [ "$RC" -eq 0 ] || die "flisk project --yes exited $RC"
  run resource resource "$RES" --type mcp --stack "$STACK" --yes --json
  [ "$RC" -eq 0 ] || die "flisk resource $RES --type mcp exited $RC"
  jq -e --arg n "$RES" '.schemaVersion == 1 and .errors == [] and .data.name == $n and .data.type == "mcp"' "$OUT/resource.out" >/dev/null \
    || die "flisk resource --json did not report an mcp resource named $RES"
}

DS3() {
  log "DS3 flisk distribute status --init, status --json and board --json"
  run status-init distribute status --init
  [ "$RC" -eq 0 ] || die "flisk distribute status --init exited $RC"
  [ -f "$DIR/distribution.json" ] || die "flisk distribute status --init wrote no distribution.json"
  run status distribute status --json
  [ "$RC" -eq 0 ] || die "flisk distribute status --json exited $RC"
  jq -e --arg n "$RES" '.schemaVersion == 1 and .errors == [] and (.data.grid.apps | index($n) != null) and (.data.grid.channels | length > 0)' \
    "$OUT/status.out" >/dev/null || die "flisk distribute status --json does not list $RES in its grid"
  run board distribute board --json
  [ "$RC" -eq 0 ] || die "flisk distribute board --json exited $RC"
  jq -e '.schemaVersion == 1 and .errors == []
      and ([.data.board.rows[].stage] == ["Idea", "Promise", "Shape", "Ship", "Listed", "Proof"])
      and all(.data.board.rows[]; (.cells | keys | sort) == (["How", "What", "When", "Where", "Who", "Why"]))
      and all(.data.board.rows[].cells[]; (.text | type) == "string" and (.isMissing | type) == "boolean")' \
    "$OUT/board.out" >/dev/null || die "flisk distribute board --json is not 6 stages by What, How, Where, Who, When and Why"
}

DS4() {
  log "DS4 flisk distribute kit $RES --dry-run writes nothing"
  local before; before="$(snapshot)"
  run kit distribute kit "$RES" --dry-run
  [ "$RC" -eq 0 ] || die "flisk distribute kit --dry-run exited $RC"
  grep -q 'plugin.json' "$OUT/kit.out" || die "the dry run did not print the kit's plugin.json"
  [ ! -e "$DIR/distribution/$RES" ] || die "the dry run created distribution/$RES"
  expect_unchanged "$before" "flisk distribute kit --dry-run"
}

DS5() {
  log "DS5 flisk export render and wrangler dry runs write nothing"
  local before; before="$(snapshot)"
  run render export render --dry-run
  [ "$RC" -eq 0 ] || die "flisk export render --dry-run exited $RC"
  grep -q "name: \"$RES\"" "$OUT/render.out" || die "the render dry run does not name $RES"
  # An mcp resource has a Dockerfile, so wrangler refuses it unless told it is a Worker; the refusal must say how.
  run wrangler-refused export wrangler --resource "$RES" --dry-run
  [ "$RC" -ne 0 ] || die "flisk export wrangler accepted a Docker resource without --allow-non-worker"
  grep -q -- '--allow-non-worker' "$OUT/wrangler-refused.err" || die "the wrangler refusal does not name --allow-non-worker"
  run wrangler export wrangler --resource "$RES" --allow-non-worker --dry-run
  [ "$RC" -eq 0 ] || die "flisk export wrangler --dry-run exited $RC"
  grep -q 'name' "$OUT/wrangler.out" || die "the wrangler dry run printed no wrangler.toml"
  [ ! -e "$DIR/render.yaml" ] && [ ! -e "$DIR/wrangler.toml" ] || die "a dry run wrote render.yaml or wrangler.toml"
  expect_unchanged "$before" "flisk export --dry-run"
}

mcp_healthy() { [ "$(traefik_request "$RES" /health -o /dev/null -w '%{http_code}')" = "200" ]; }

DS6() {
  log "DS6 flisk up, then flisk mcp check $RES (list-only) passes"
  : >"$DIR/up.log"
  start_stack "$STACK"
  wait_status_url "$RES"
  poll_until "$RES answers /health 200 through Traefik" "$READY_TIMEOUT" mcp_healthy
  run mcp-check mcp check "$RES"
  [ "$RC" -eq 0 ] || die "flisk mcp check $RES exited $RC"
  run mcp-check-json mcp check "$RES" --json
  [ "$RC" -eq 0 ] || die "flisk mcp check $RES --json exited $RC"
  jq -e --arg n "$RES" '.schemaVersion == 1 and .errors == [] and .data.resource == $n and .data.didPass == true and .data.failures == 0
      and (.data.url | endswith("/mcp")) and (.data.checks | length > 0)
      and all(.data.checks[]; (.check | type) == "string" and (.didPass | type) == "boolean")
      and ([.data.checks[].check] | index("initialize") != null and index("tools/list") != null)
      and any(.data.checks[]; .check == "tools/call" and .isSkipped == true)
      and all(.data.checks[]; (.check | startswith("tools/call ")) | not)' \
    "$OUT/mcp-check-json.out" >/dev/null || die "flisk mcp check --json did not pass with the documented shape"
}

e2e_main "$@"
