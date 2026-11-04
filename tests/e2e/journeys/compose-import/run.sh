#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The homepage pitch, end to end on a clean machine: a plain docker-compose.yml, `flisk import --yes`, `flisk up`, and the app
# answering. It failed silently before 1.4.11 (the importer wrote the pre-rename project folder, moved the API off its port, renamed
# db and dropped the Postgres password), so it is a journey: it runs on every pull request and records the cold time the homepage may quote.
#
#   tests/e2e/journeys/compose-import/run.sh all      every case in order, then cleanup
#   tests/e2e/journeys/compose-import/run.sh CI1 CI2  single cases
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init compose-import composeapp
RESOURCES=(api db)
T0_FILE="$SUITE_ROOT/t0"
api_answers() { [ "$(traefik_request api / 2>/dev/null)" = "hello from api" ]; }

CI1() { # write the Compose app and import it: ports and names kept, the password in .env, no pre-rename names
  log "CI1 flisk import a plain Compose app"
  rm -rf "$DIR" && mkdir -p "$DIR/api" && cd "$DIR"
  cat > api/server.js <<'JS'
const http = require("node:http");
const net = require("node:net");
// The app keeps its own port and reaches Postgres by its Compose name, as it does under docker compose.
http.createServer((req, res) => {
  if (req.url === "/db") {
    const socket = net.connect(5432, "db");
    socket.on("connect", () => { socket.destroy(); res.end("db:5432 reachable\n"); });
    socket.on("error", (e) => { res.statusCode = 503; res.end(`db: ${e.message}\n`); });
    return;
  }
  res.end("hello from api\n");
}).listen(3000);
JS
  printf 'FROM node:22-alpine\nWORKDIR /app\nCOPY server.js .\nCMD ["node", "server.js"]\n' > api/Dockerfile
  cat > docker-compose.yml <<'YAML'
services:
  api:
    build: ./api
    ports: ["3000:3000"]
    depends_on: [db]
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: example
YAML
  # The clock the homepage quotes starts here: from `flisk import` to the first answer through Traefik (CI3).
  date +%s > "$T0_FILE"
  flisk import . --yes | tee "$OUT/import.out"
  [ -f .flisk/project.json ] || die "flisk import did not write .flisk/project.json"
  [ ! -e .tdk ] || die "flisk import wrote .tdk/"
  ! grep -qiE 'tdk (up|core)|\.tdk/' "$OUT/import.out" || die "flisk import printed the old tdk name"
  local api="services/composeapp/api/service.json" db="services/composeapp/db/service.json"
  [ "$(jq -r .port "$api")" = 3000 ] || die "api port is $(jq -r .port "$api"), not the Compose port 3000"
  [ -f "$db" ] || die "db was renamed (no $db)"
  jq -e '.secrets.required == ["POSTGRES_PASSWORD"]' "$db" >/dev/null || die "db does not require POSTGRES_PASSWORD"
  grep -qx 'POSTGRES_PASSWORD=example' .env || die "POSTGRES_PASSWORD was not copied to .env"
  grep -qx '.env' .gitignore || die ".env is not gitignored"
}

CI2() { # flisk up, then wait until the API answers through Traefik
  log "CI2 flisk up and wait for the api"
  cd "$DIR"
  start_stack composeapp
  wait_status_url api
  poll_until "api answers through Traefik" "$READY_TIMEOUT" api_answers
}

CI3() { # the time from flisk import to the first answer, as a job summary line and a JSON file
  log "CI3 record the time from flisk import to a running app"
  local t0 t1 seconds
  t0="$(cat "$T0_FILE")"
  t1="$(date +%s)"
  seconds=$((t1 - t0))
  printf '{"metric":"compose_import_to_running","seconds":%d,"flisk_version":"%s","runner":"%s","start_cache":"cold"}\n' \
    "$seconds" "${FLISK_VERSION:-local}" "${RUNNER_OS:-$(uname -s)}" | tee "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/compose-import-time.json"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo "### Compose import to a running app"
      echo ""
      echo "- \`flisk import\` to the API answering through Traefik: **${seconds}s** ($((seconds / 60))m $((seconds % 60))s)"
      echo "- Cold start: no images or build cache on the runner"
    } >> "$GITHUB_STEP_SUMMARY"
  fi
}

CI4() { # the app reaches Postgres by its Compose name
  log "CI4 api reaches db:5432"
  [ "$(traefik_request_ok api /db)" = "db:5432 reachable" ] || die "api cannot reach db:5432"
}

e2e_main "$@"
