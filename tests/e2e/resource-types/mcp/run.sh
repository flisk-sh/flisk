#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# An mcp resource on a live stack, moved from scripts/verify-mcp.sh (#1296, openspec task 3.2). Scaffold it, bring it up through a
# real `tdk up` and Traefik, and talk to it with the official MCP TypeScript SDK client (not just curl): connect, list the tools,
# call the `echo` tool. The client uses the real host name api.<project>.localhost, so this also shows that a client resolves it.
# Runs nightly, on release and by hand; see suite.json.
#
#   tests/e2e/resource-types/mcp/run.sh all            every case in order, then cleanup
#   tests/e2e/resource-types/mcp/run.sh P1 P2 P3       single cases
# Needs: tdk on PATH, Docker, Tilt, Node 22+, jq, curl, and network access (P3 installs the MCP SDK into a temp directory).
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
# shellcheck source=../common.sh
source "$SUITE_DIR/../common.sh"
e2e_init mcp mcpe2e
STACK=app
RES=mcpres
RESOURCES=("$RES")
# The SDK and its full dependency tree are pinned in package-lock.json.

mcp_healthy() { [ "$(traefik_request "$RES" /health -o /dev/null -w '%{http_code}')" = "200" ]; }

P1() { # scaffold the mcp resource
  log "P1 scaffold an mcp resource"
  common_scaffold mcp "$RES" --stack "$STACK" --yes
}

P2() { # tdk up, listed as an mcp resource, healthy through Traefik
  log "P2 tdk up, $RES listed as mcp, healthy through Traefik"
  : >"$DIR/up.log"
  start_stack "$STACK"
  wait_status_url "$RES"
  common_wait_status "$RES" mcp
  poll_until "$RES answers /health 200 through Traefik" "$READY_TIMEOUT" mcp_healthy
}

P3() { # the MCP SDK client connects, lists the tools and calls echo
  log "P3 the MCP SDK client connects through Traefik and calls echo"
  local url clientdir out
  url="$(resource_url "$RES")/mcp"
  clientdir="$(mktemp -d)"
  cp "$SUITE_DIR/package.json" "$SUITE_DIR/package-lock.json" "$clientdir/"
  (cd "$clientdir" && npm ci --no-audit --no-fund) \
    || die "could not install the locked MCP SDK dependencies"
  cp "$SUITE_DIR/client.mjs" "$clientdir/client.mjs"
  out="$(cd "$clientdir" && node client.mjs "$url" 2>&1)" || { echo "$out" >&2; rm -rf "$clientdir"; die "the MCP SDK client could not use $url"; }
  rm -rf "$clientdir"
  echo "$out"
  echo "$out" | grep -q '"echo":"hello from the MCP client"' || die "echo did not return the message: $out"
  echo "$out" | grep -q '"isError":false' || die "echo reported an error: $out"
}

e2e_main "$@"
