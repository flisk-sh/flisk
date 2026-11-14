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
#   D4  A container an older layout left in the demo folder (it holds Postgres's host port) is stopped by the demo's reset, so
#       the demo starts instead of failing with "port is already allocated" (#4124).
#   N1  With Docker not running (a `docker` on PATH that fails), `flisk demo` falls back to the small demo as local processes, exits 0,
#       and its website and the menu API behind it answer.
#   N2  A second `flisk demo` while it runs reopens it instead of starting another copy.
#   N3  After `flisk down` the processes are gone, and a third `flisk demo` starts the demo again in the same folder.
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
DIR_NATIVE="$SUITE_ROOT/demo-native"
NO_DOCKER_BIN="$SUITE_ROOT/no-docker-bin"

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
  # Traefik can lag the container becoming healthy by a few seconds (a 404 until its router loads), so retry for up to a minute.
  local attempt
  for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
    tried=""
    for url in $urls; do
      for form in "$url" "${url%/}/" "${url%/}/health"; do
        code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$form" || true)"
        tried="$tried $form=$code"
        case "$code" in
          2??) echo "$form answered $code"; return 0 ;;
        esac
      done
    done
    sleep 5
  done
  die "no demo URL answered 2xx:$tried"
}

D4() { # a leftover container of an older layout holds a port the demo needs
  log "D4 flisk demo with a container of an older layout in the demo folder"
  local home="$SUITE_ROOT/home" folder legacy docker_host
  # D2 leaves the second demo running in $DIR_TWO under the same Compose project name. `flisk demo` rightly refuses to take
  # over another folder's containers ("already has Docker containers from another folder"), so stop the earlier stacks first.
  stack_down "$DIR_ONE"
  stack_down "$DIR_TWO"
  # Docker finds its socket through $HOME (Colima, Docker Desktop), so the scratch HOME must keep talking to the same daemon.
  docker_host="${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)}"
  # The demo's own folder is ~/.flisk/flisk-demo, which is where the reset runs: point HOME at a scratch folder so a machine's real demo is untouched.
  folder="$home/.flisk/flisk-demo"
  legacy="$folder/services/platform/database-management"
  rm -rf "$home"
  mkdir -p "$folder/.flisk" "$legacy"
  # The Compose plugin and the CLI config live in ~/.docker.
  [ -e "$HOME/.docker" ] && ln -s "$HOME/.docker" "$home/.docker"
  echo '{"project":{"name":"flisk-restaurant-example"}}' > "$folder/.flisk/project.json"
  # What 1.3.x started: Compose project `flisk_demo`, publishing Postgres's host port.
  printf 'services:\n  postgres:\n    image: busybox:latest\n    command: sleep 3600\n    ports: ["127.0.0.1:15434:80"]\n' > "$legacy/docker-compose.yml"
  (cd "$legacy" && docker compose -p flisk_demo up -d >/dev/null) || die "could not start the stand-in for the old demo container"
  docker ps --filter publish=15434 --format '{{.Names}}' | grep -q . || die "the stand-in container does not hold port 15434"
  if ! HOME="$home" DOCKER_HOST="$docker_host" timeout "$DEMO_TIMEOUT" flisk demo --yes > "$OUT/demo-legacy.out" 2>&1; then
    tail -60 "$OUT/demo-legacy.out"
    docker compose -p flisk_demo down >/dev/null 2>&1 || true
    die "flisk demo did not finish ready with an old container holding port 15434"
  fi
  if docker ps -a --format '{{.Label "com.docker.compose.project"}}' | grep -qx flisk_demo; then
    die "the old demo container is still there after the demo"
  fi
  (cd "$folder" && HOME="$home" DOCKER_HOST="$docker_host" flisk down --yes) || die "flisk down failed in $folder"
}

native_demo() { # <log name>: `flisk demo` with a Docker that is installed but not running
  mkdir -p "$NO_DOCKER_BIN"
  printf '#!/bin/sh\necho "Cannot connect to the Docker daemon" >&2\nexit 1\n' > "$NO_DOCKER_BIN/docker"
  chmod +x "$NO_DOCKER_BIN/docker"
  if ! PATH="$NO_DOCKER_BIN:$PATH" timeout 300 flisk demo --project "$DIR_NATIVE" > "$OUT/$1.out" 2>&1; then
    tail -60 "$OUT/$1.out"
    [ -f "$DIR_NATIVE/.flisk/demo-native.log" ] && tail -40 "$DIR_NATIVE/.flisk/demo-native.log"
    die "flisk demo without Docker did not finish ready"
  fi
}

native_web_url() { grep -aoE 'http://localhost:[0-9]+' "$OUT/native-first.out" | head -1; }

N1() { # the demo without Docker starts the two services as local processes
  log "N1 flisk demo with Docker not running"
  (cd "$DIR_NATIVE" 2>/dev/null && flisk down >/dev/null 2>&1) || true
  rm -rf "$DIR_NATIVE"
  native_demo native-first
  grep -aq "without Docker" "$OUT/native-first.out" || die "the demo did not say it runs without Docker"
  local web
  web="$(native_web_url)"
  [ -n "$web" ] || { tail -40 "$OUT/native-first.out"; die "the demo printed no localhost URL"; }
  curl -fsS --max-time 10 "$web/" | grep -q "Tonight's menu" || die "$web did not serve the demo page"
  curl -fsS --max-time 10 "$web/api/menu" | grep -q "Margherita" || die "$web/api/menu did not reach the menu API"
}

N2() { # a second run while it is up reopens it
  log "N2 second flisk demo while the demo without Docker runs"
  native_demo native-second
  grep -aq "already running" "$OUT/native-second.out" || { tail -20 "$OUT/native-second.out"; die "the second run did not reuse the running demo"; }
}

N3() { # flisk down stops it, and the next demo starts again
  log "N3 flisk down, then flisk demo again"
  local web
  web="$(native_web_url)"
  (cd "$DIR_NATIVE" && flisk down) || die "flisk down failed in $DIR_NATIVE"
  if curl -fsS --max-time 5 "$web/health" >/dev/null 2>&1; then die "$web still answers after flisk down"; fi
  native_demo native-third
  curl -fsS --max-time 10 "$(grep -aoE 'http://localhost:[0-9]+' "$OUT/native-third.out" | head -1)/api/menu" | grep -q "Margherita" \
    || die "the demo did not answer after it was started again"
  (cd "$DIR_NATIVE" && flisk down) || die "flisk down failed in $DIR_NATIVE"
}

e2e_main "$@"
