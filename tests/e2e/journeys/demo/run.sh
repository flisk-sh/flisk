#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The one-command demo on a clean machine. The demo is the first thing a new user runs, so this suite is P1: it must pass on every
# pull request that can change what the command does, and a red run blocks the merge.
#
#   D1  `flisk demo` starts the whole stack and exits 0.
#   D2  After `flisk down` (which keeps Docker volumes), a second `flisk demo` in a new folder gets a new random DB_PASSWORD. It must
#       start too, and the migrator must not fail with Prisma P1000 (authentication failed against the old Postgres data).
#   D3  The frontend the second run printed answers with a 2xx.
#
#   tests/e2e/journeys/demo/run.sh all          every case in order, then cleanup
#   tests/e2e/journeys/demo/run.sh D2           a single case (needs D1's project folder)
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init demo demo-one
DIR_ONE="$SUITE_ROOT/demo-one"
DIR_TWO="$SUITE_ROOT/demo-two"
DEMO_TIMEOUT="${E2E_DEMO_TIMEOUT:-1800}"

run_demo() { # <project dir> <log name>: the demo prints its progress frames to stdout; exit 0 means the stack is ready
  local dir="$1" name="$2"
  mkdir -p "$SUITE_ROOT"
  # No browser on a runner: the demo treats a failed open as a non-failure, so the URL is still printed.
  if ! timeout "$DEMO_TIMEOUT" flisk demo --project "$dir" > "$OUT/$name.out" 2>&1; then
    tail -60 "$OUT/$name.out"
    die "flisk demo --project $dir did not finish ready"
  fi
  if grep -aq "P1000" "$OUT/$name.out"; then
    die "$name: the migrator reported Prisma P1000 (database credentials rejected)"
  fi
}

stack_down() { # <project dir>: stop the stack but keep its Docker volumes, as a user's `flisk down` does
  [ -f "$1/.flisk/project.json" ] || return 0
  (cd "$1" && flisk down --yes) || die "flisk down failed in $1"
}

D1() { # the first demo on a machine with no earlier data
  log "D1 first flisk demo"
  rm -rf "$DIR_ONE" "$DIR_TWO"
  run_demo "$DIR_ONE" demo-first
}

D2() { # the second demo: new folder, new password, same Docker project and the first run's Postgres volume
  log "D2 second flisk demo after flisk down"
  [ -f "$DIR_ONE/.flisk/project.json" ] || die "D2 needs D1's project at $DIR_ONE"
  local first second
  first="$(grep '^DB_PASSWORD=' "$DIR_ONE/.env" | cut -d= -f2-)"
  stack_down "$DIR_ONE"
  # The volumes outlive the stack: that is the state a returning user is in.
  docker volume ls --format '{{.Name}}' | grep -q 'postgres_data' \
    || die "expected the first run's Postgres volume to survive flisk down"
  run_demo "$DIR_TWO" demo-second
  second="$(grep '^DB_PASSWORD=' "$DIR_TWO/.env" | cut -d= -f2-)"
  [ -n "$first" ] && [ -n "$second" ] || die "a demo project has no DB_PASSWORD in .env"
  [ "$first" != "$second" ] || echo "::warning::both demo runs got the same DB_PASSWORD, so this run did not exercise the changed-password case"
}

D3() { # a frontend the second run printed answers
  log "D3 the demo frontend answers"
  # The demo prints each frontend's base URL. A frontend mounted under a base path answers its page with a trailing slash, and every
  # Flisk service answers /health, so a URL passes when any of those forms returns 2xx.
  local urls url form code tried=""
  urls="$(grep -aoE 'https?://[A-Za-z0-9._-]+(:[0-9]+)?/[A-Za-z0-9._/-]*' "$OUT/demo-second.out" | grep -vE ':1035[0-9]' | sort -u)"
  [ -n "$urls" ] || { tail -40 "$OUT/demo-second.out"; die "the second demo printed no frontend URL"; }
  for url in $urls; do
    for form in "$url" "${url%/}/" "${url%/}/health"; do
      code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$form" || true)"
      tried="$tried $form=$code"
      case "$code" in
        2??) echo "$form answered $code"; return 0 ;;
      esac
    done
  done
  die "no demo URL answered 2xx:$tried"
}

e2e_main "$@"
