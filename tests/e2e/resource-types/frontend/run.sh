#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# A frontend resource in one framework on a live stack, moved from scripts/verify-frontend-frameworks.sh (#1296, openspec task 3.3).
# The matrix runs this suite once per frameworkFrontend value, with FRAMEWORK set to that framework. The check is stronger than a
# vite build: it proves the generated Dockerfile, nginx and the Traefik route. Runs nightly, on release and by hand; see suite.json.
#
#   FRAMEWORK=react tests/e2e/resource-types/frontend/run.sh all     every case in order, then cleanup
#   tests/e2e/resource-types/frontend/run.sh F1 F2                   single cases (FRAMEWORK defaults to react)
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK="${FRAMEWORK:-react}"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
# shellcheck source=../common.sh
source "$SUITE_DIR/../common.sh"
e2e_init frontend "frontend-$FRAMEWORK"
STACK=app
RES="fe-$FRAMEWORK"
RESOURCES=("$RES")

# The module script the app's HTML references, checked through the route: it must be served with a JavaScript content type.
asset_ok() { # <html file> -> prints "<asset> <status> <content type>"; returns 0 when the asset is served as JavaScript
  local asset info
  asset="$(grep -oE 'src="[^"]*\.js"' "$1" | head -1 | sed 's/^src="//; s/"$//' || true)"
  [ -n "$asset" ] || { echo "none"; return 1; }
  case "$asset" in /*) ;; *) asset="/$RES/$asset" ;; esac
  # The page's src is an absolute path that already includes the base (/<resource>/...), as a browser would request it, so it
  # is fetched from the host root, not appended to the resource's url (which already ends in /<resource>).
  info="$(route_root_request "$asset" -o /dev/null -w '%{http_code} %{content_type}' || true)"
  echo "$asset $info"
  case "$info" in "200 "*javascript*) return 0 ;; *) return 1 ;; esac
}
# The host root for a resource url: the url minus its /<resource> base path. Traefik routes on that path.
route_root_request() { # <path> [curl args...]: GET the path from the host root through Traefik
  local path="$1"; shift
  local base root host port
  base="$(resource_url "$RES")"
  root="${base%/"$RES"}"
  host="$(echo "$root" | sed -E 's#^https?://([^:/]+).*#\1#')"
  port="$(echo "$root" | sed -nE 's#^https?://[^:/]+:([0-9]+).*#\1#p')"; port="${port:-80}"
  curl -sS --max-time 20 --resolve "$host:$port:127.0.0.1" "$@" "$root$path"
}
route_ok() { [ "$(traefik_request "$RES" "/" -o /dev/null -w '%{http_code}' || true)" = "200" ]; }

F1() { # scaffold the frontend in the framework
  log "F1 scaffold a $FRAMEWORK frontend"
  common_scaffold frontend "$RES" --framework "$FRAMEWORK" --stack "$STACK" --yes
}

F2() { # tdk up, the route answers 200 through Traefik, and the module script is served as JavaScript
  log "F2 tdk up, GET /$RES/ -> 200, module script served as JavaScript"
  : >"$DIR/up.log"
  start_stack "$STACK"
  wait_status_url "$RES"
  poll_until "$RES route answers 200 through Traefik" "$READY_TIMEOUT" route_ok
  local html="$OUT/f2-index.html"
  traefik_request "$RES" "/" >"$html"
  local result
  result="$(asset_ok "$html")" || die "the $FRAMEWORK module script is missing or not served as JavaScript: $result"
  echo "PASS $FRAMEWORK: module script $result"
}

e2e_main "$@"
