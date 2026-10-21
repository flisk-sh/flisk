#!/usr/bin/env bash
# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
# Cases every resource type shares (#1290, openspec task 3b.1), parameterized by the resource's appType. A suite sources this
# after tests/e2e/lib/lib.sh and calls the helpers with its own resource name and type:
#
#   common_scaffold <appType> <resource> [<extra flisk resource args>...]  scaffold the project and the resource (A1 pattern)
#   common_wait_status <resource> <type>    bounded wait until `flisk status --json` lists the resource with that type (A2 pattern)
#   common_restart <resource> <id before> [<ready command...>]  flisk restart, wait for a different running container, then for the
#                                                             ready command when one is given (A6 pattern)
#   common_error_envelope <code> <cmd...>   the command exits 1 and prints one error envelope with that code
#
# The agent suite still has its own copies of these cases; it moves onto this file in a later change (3b.4). Nothing here runs
# on its own, so it is only checked for syntax by `make test-shell`.

# Assumes lib.sh is loaded: run, RC, OUT, DIR, assert, die, log, poll_until, wait_restarted, status_json.

common_scaffold() { # <appType> <resource> [<extra flisk resource args>...]
  local type="$1" name="$2"; shift 2
  log "scaffold: flisk project --yes, flisk resource $name --type $type"
  rm -rf "$DIR"; mkdir -p "$DIR"
  (cd "$DIR" && git init -q .)
  run "scaffold-project" project --yes
  [ "$RC" -eq 0 ] || die "flisk project --yes exited $RC"
  run "scaffold-$name" resource "$name" --type "$type" "$@"
  [ "$RC" -eq 0 ] || die "flisk resource $name --type $type exited $RC"
}

common_listed() { status_json | jq -e --arg n "$1" --arg t "$2" '.data.resources[] | select(.name==$n and .type==$t)' >/dev/null; } # <resource> <type>

common_wait_status() { # <resource> <type>
  local name="$1" type="$2"
  poll_until "$name listed as $type in flisk status" "${READY_TIMEOUT:-120}" common_listed "$name" "$type"
  run "status-$name" status --json
  assert check "$OUT/status-$name.out" "j.errors.length === 0 && j.data.resources.some(r => r.name === '$name' && r.type === '$type')" "flisk status --json lists $name as $type"
}

common_restart() { # <resource> <container id from before the restart> [<ready command...>]
  local name="$1" before="$2"; shift 2
  run "restart-$name" restart "$name" --json
  [ "$RC" -eq 0 ] || die "flisk restart $name exited $RC"
  assert envelope "$OUT/restart-$name.out"
  assert check "$OUT/restart-$name.out" "j.errors.length === 0 && j.data.resource === '$name' && j.data.restarted === true" "restart envelope is { resource, restarted: true }"
  # Tilt replaces the container; wait for a different running one before the next case reads it.
  wait_restarted "$name" "$before" "$@"
}

common_error_envelope() { # <code> <command...>
  local code="$1"; shift
  run "error-$code" "$@"
  [ "$RC" -eq 1 ] || die "expected exit 1 for $code, got $RC"
  assert envelope "$OUT/error-$code.out" "$code"
}
