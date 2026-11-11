#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The next-postgres starter (`flisk create <name> --starter next-postgres`): a Next.js website, an Express API and Postgres, with a
# migrator that creates and seeds the items table. It runs the dev stack, so the web Dockerfile's production stage is not covered here.
#
#   NP1  `flisk create --starter next-postgres` writes the project, then `flisk up app` starts it and the api, web and db are ready.
#   NP2  The migrator (api-migrator) exited 0, and GET /items through the router URL returns the 3 seeded rows.
#   NP3  POST, PATCH and DELETE on /items work and leave the 3 seeded rows.
#   NP4  The web page answers 200 through the router and renders the starter's page (the rows are loaded by the browser; NP2 checks them).
#   NP5  POST /items with a 201-character title is refused with 400, and nothing is stored.
#
#   tests/e2e/journeys/next-postgres/run.sh all          every case in order, then cleanup
#   tests/e2e/journeys/next-postgres/run.sh NP2          a single case (needs NP1's stack)
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init next-postgres nextpg
RESOURCES=(api api-migrator web db)

items_count() { traefik_request_ok api /items | jq 'length'; }
web_ok() { traefik_request_ok web / >/dev/null; }
all_ready() { status_json | jq -e '[.data.resources[] | select(.name=="api" or .name=="web")] | length == 2 and all(.status == "ready")'; }

NP1() { # create the starter and start it
  log "NP1 flisk create --starter next-postgres, then flisk up"
  e2e_cleanup
  mkdir -p "$SUITE_ROOT"
  run_in "$SUITE_ROOT" create create "$PROJECT" --starter next-postgres --yes
  [ "$RC" -eq 0 ] || die "flisk create exited $RC"
  [ -f "$DIR/.flisk/project.json" ] || die "flisk create wrote no project at $DIR"
  : >"$DIR/up.log"
  start_stack app
  poll_until "flisk status lists api and web ready" "$(scaled_ready_timeout 4 300)" all_ready
}

NP2() { # the migrator finished with 0 and the seed rows are served
  log "NP2 migrator exit code and the seeded rows"
  local c state
  c="$(docker ps -aq --filter "name=${PROJECT}-.*-api-migrator-" | head -1)"
  [ -n "$c" ] || die "no api-migrator container found"
  poll_until "the migrator container exited" 120 bash -c "[ \"\$(docker inspect -f '{{.State.Status}}' $c)\" = exited ]"
  state="$(docker inspect -f '{{.State.ExitCode}}' "$c")"
  [ "$state" = 0 ] || { docker logs "$c" 2>&1 | tail -40; die "the migrator exited $state"; }
  poll_until "GET /items answers through the router" 120 traefik_request_ok api /items
  traefik_request_ok api /items >"$OUT/items.json"
  assert check "$OUT/items.json" 'j.length === 3 && j[0].title === "Run flisk create"' "GET /items returns the 3 seeded rows"
}

NP3() { # create, update and delete an item
  log "NP3 POST, PATCH, DELETE"
  local created id
  created="$(traefik_request_ok api /items -X POST -H 'content-type: application/json' -d '{"title":"e2e item"}')"
  echo "$created" >"$OUT/created.json"
  assert check "$OUT/created.json" 'j.title === "e2e item" && j.done === false' "POST /items returns the new item"
  id="$(echo "$created" | jq -r .id)"
  traefik_request_ok api "/items/$id" -X PATCH -H 'content-type: application/json' -d '{"done":true}' >"$OUT/patched.json"
  assert check "$OUT/patched.json" 'j.done === true && j.title === "e2e item"' "PATCH /items/:id ticks the item"
  traefik_request_ok api /items >"$OUT/items-after.json"
  assert check "$OUT/items-after.json" 'j.length === 4 && j.some((i) => i.title === "e2e item" && i.done)' "the item is stored"
  traefik_request_ok api "/items/$id" -X DELETE >/dev/null
  [ "$(items_count)" = 3 ] || die "DELETE /items/:id did not remove the item"
}

NP4() { # the website renders a seeded title
  log "NP4 the web page"
  local page="$OUT/web.html"
  poll_until "the web page answers 200" 120 web_ok
  traefik_request_ok web / >"$page"
  # The list is loaded by the browser from the API, so the served HTML holds the page, not the rows (NP2 checks the rows).
  grep -q "Next.js · Express · Postgres" "$page" || { head -c 2000 "$page"; die "the web page is not the starter's page"; }
  grep -q "$PROJECT" "$page" || die "the web page does not show the project name"
  grep -q "/web/_next/static" "$page" || die "the web page does not reference its built assets under /web/"
}

NP5() { # a title over 200 characters is refused
  log "NP5 201-character title"
  local title code
  title="$(printf 'x%.0s' $(seq 1 201))"
  code="$(traefik_request api /items -X POST -H 'content-type: application/json' -d "{\"title\":\"$title\"}" -o /dev/null -w '%{http_code}')"
  [ "$code" = 400 ] || die "POST with a 201-character title returned $code, expected 400"
  [ "$(items_count)" = 3 ] || die "the refused POST stored a row"
}

e2e_main "$@"
