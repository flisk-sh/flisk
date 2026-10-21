#!/usr/bin/env bash
# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
# Shared helpers for the live-stack e2e suites under tests/e2e/<group>/<suite>/. A suite's run.sh names itself, sources this
# file, defines one function per case (listed in its suite.json) and hands its arguments to e2e_main:
#
#   SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "$SUITE_DIR/../../lib/lib.sh"
#   e2e_init agent agente2e          # suite name, default scratch project name
#   RESOURCES=(bot)                  # resources whose container logs `diagnostics` collects
#   A1() { ... }
#   e2e_main "$@"
#
# run.sh then accepts:  <case>...  |  all  |  list  |  self-check  |  diagnostics  |  cleanup
#
# e2e_init sets (environment overrides in brackets):
#   REPO_ROOT, E2E_LIB    the repository root and this directory
#   SUITE_ROOT            scratch space for the suite: $E2E_ROOT/<suite> [E2E_ROOT, default $RUNNER_TEMP/tdk-e2e or $TMPDIR/tdk-e2e]
#   PROJECT, DIR          the scratch project's name [E2E_PROJECT] and directory ($SUITE_ROOT/$PROJECT)
#   OUT                   stdout/stderr of every `run`, one file per name
#   ARTIFACTS             where `diagnostics` writes [E2E_ARTIFACTS, default $SUITE_ROOT/artifacts]
#   READY_TIMEOUT         seconds a stack may take to become ready [E2E_READY_TIMEOUT, default 1200]
#
# There are no fixed sleeps here: waiting is poll_until with a deadline, which names what it waited for and prints the stack's
# log and container state when it runs out.

E2E_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$E2E_LIB/../../.." && pwd)"

e2e_init() { # <suite> <default project name>
  SUITE_NAME="$1"
  SUITE_ROOT="${E2E_ROOT:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/tdk-e2e}/$SUITE_NAME"
  PROJECT="${E2E_PROJECT:-$2}"
  DIR="$SUITE_ROOT/$PROJECT"
  OUT="$SUITE_ROOT/out"
  ARTIFACTS="${E2E_ARTIFACTS:-$SUITE_ROOT/artifacts}"
  READY_TIMEOUT="${E2E_READY_TIMEOUT:-1200}"
  RESOURCES=()
  mkdir -p "$SUITE_ROOT" "$OUT"
}

log() { printf '\n== %s\n' "$*"; }
die() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
now_ms() { node -p 'Date.now()'; }
assert() { node "$E2E_LIB/assert-json.mjs" "$@" || die "assertion failed: $*"; } # envelope|check|equal, see assert-json.mjs

# poll_until <description> <timeout seconds> <command...>: retry the command every 2s until it succeeds or the deadline passes.
poll_until() {
  local desc="$1" timeout="$2"; shift 2
  local deadline=$((SECONDS + timeout))
  while ! "$@" >/dev/null 2>&1; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "::error::timed out after ${timeout}s waiting for: $desc" >&2
      tail -40 "$DIR/up.log" 2>/dev/null >&2 || true
      docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' >&2 || true
      return 1
    fi
    sleep 2
  done
}

# run_in <dir> <name> <flisk args...>: run flisk in <dir>, echo the command and its raw output (the evidence a CI log shows), keep
# stdout in $OUT/<name>.out and stderr in $OUT/<name>.err. Sets RC to the exit code and ELAPSED_MS to the wall time. It never
# aborts the script itself, so the case decides what exit code it expects.
run_in() {
  local dir="$1" name="$2"; shift 2
  local start; start="$(now_ms)"
  if [ "$dir" = "$DIR" ]; then printf '$ flisk %s\n' "$*"; else printf '$ (cd %s && flisk %s)\n' "$dir" "$*"; fi
  set +e
  (cd "$dir" && flisk "$@") >"$OUT/$name.out" 2>"$OUT/$name.err"
  RC=$?
  set -e
  ELAPSED_MS=$(( $(now_ms) - start ))
  cat "$OUT/$name.out"
  [ -s "$OUT/$name.err" ] && { echo "[stderr]"; cat "$OUT/$name.err"; }
  echo "[exit $RC, ${ELAPSED_MS}ms]"
}
run() { run_in "$DIR" "$@"; } # <name> <flisk args...> in the scratch project

# ------------------------------------------------------------------------------------------------------------- stack and status

status_json() { (cd "$DIR" && flisk status --json 2>/dev/null); }
resource_field() { status_json | jq -r --arg n "$1" --arg f "$2" '.data.resources[] | select(.name==$n) | .[$f]'; } # <resource> <field>
resource_port() { resource_field "$1" port; }
resource_url() { resource_field "$1" url; }

start_stack() { # <stack>: `flisk up` in the background, appending to $DIR/up.log
  (cd "$DIR" && nohup flisk up "$1" >>"$DIR/up.log" 2>&1 &)
}
# wait_status_url <resource>: bounded wait until `flisk status --json` lists the resource with a Traefik url.
wait_status_url() {
  poll_until "flisk status lists $1 with a Traefik url" "$READY_TIMEOUT" \
    bash -c "cd '$DIR' && flisk status --json | jq -e --arg n '$1' '.data.resources[] | select(.name==\$n) | .url'"
}

# Containers are named <project>-<stack>-<resource>-<n>.
running_container() { docker ps -q --filter "name=${PROJECT}-.*-$1-" --filter status=running | head -1; } # <resource>
resource_containers() { docker ps -aq --filter "name=${PROJECT}-.*-$1-"; } # <resource>, running or not
container_replaced() { local now; now="$(running_container "$1")"; [ -n "$now" ] && [ "$now" != "$2" ]; } # <resource> <id before>

# wait_restarted <resource> <container id from before the restart> [<description> <ready command...>]
# After a restart the old container keeps answering until Tilt replaces it, so readiness alone proves nothing. Wait (bounded) for
# a different running container first, then for the ready command, so the next case never lands in the gap where the route has
# no live backend.
wait_restarted() {
  local resource="$1" before="$2"; shift 2
  poll_until "$resource container replaced after restart" 30 container_replaced "$resource" "$before" \
    || echo "$resource container id unchanged after restart; relying on readiness"
  [ "$#" -eq 0 ] || { local desc="$1"; shift; poll_until "$desc" "$READY_TIMEOUT" "$@"; }
}

# ------------------------------------------------------------------------------------------------------------- HTTP

# traefik_request <resource> <path> [curl args...]: curl the resource's Traefik route. The route's host is <name>.<project>.localhost,
# which not every resolver maps, so resolve it to loopback here. curl sends the Host header itself; if you port this to Node,
# use node:http, because fetch drops a Host header you set.
traefik_request() {
  local resource="$1" path="$2"; shift 2
  local base host port
  base="$(resource_url "$resource")"
  host="$(echo "$base" | sed -E 's#^https?://([^:/]+).*#\1#')"
  port="$(echo "$base" | sed -nE 's#^https?://[^:/]+:([0-9]+).*#\1#p')"; port="${port:-80}"
  curl -sS --max-time 20 --resolve "$host:$port:127.0.0.1" "$@" "$base$path"
}
# traefik_request_ok: the same, for a request a later assertion depends on. It prints the body either way, and returns 1 with
# the status on stderr for anything but 2xx, so an error page (Traefik's "404 page not found" when the route has no backend)
# never passes as data and a later check never blames the resource for it. Under set -e an unchecked failure ends the case.
traefik_request_ok() {
  local resource="$1" path="$2"; shift 2
  local response code
  response="$(traefik_request "$resource" "$path" "$@" -w '\n%{http_code}')" || { echo "request to $resource$path failed" >&2; return 1; }
  code="${response##*$'\n'}"
  response="${response%$'\n'*}"
  printf '%s\n' "$response"
  case "$code" in 2??) ;; *) echo "$resource$path returned HTTP $code: $response" >&2; return 1 ;; esac
}
direct() { curl -sS --max-time 20 "$@"; } # <curl args...> <url>

# with_stub <port> <mode> [args...]: start tests/e2e/lib/stub.mjs on 127.0.0.1:<port> and point the CLI at it through
# TDK_SERVICE_BASE_URL, so a case can make the "agent" hang, stall or answer anything. stop_stub undoes both.
with_stub() {
  local port="$1"; shift
  node "$E2E_LIB/stub.mjs" "$1" "$port" "${@:2}" >"$OUT/stub.log" 2>&1 &
  STUB_PID=$!
  poll_until "stub to listen on $port" 20 grep -q listening "$OUT/stub.log"
  export TDK_SERVICE_BASE_URL="http://127.0.0.1:$port"
}
stop_stub() { unset TDK_SERVICE_BASE_URL; kill "$STUB_PID" 2>/dev/null || true; wait "$STUB_PID" 2>/dev/null || true; }

# ------------------------------------------------------------------------------------------------------------- MCP

# mcp_session <name> <calls json> [cwd]: run one `flisk mcp` stdio session (initialize, tools/list, then each call) through
# mcp-client.mjs and keep the transcript in $OUT/<name>.out. Prints a one-line summary.
mcp_session() {
  local name="$1" calls="$2" cwd="${3:-$DIR}"
  echo "$calls" >"$OUT/$name.calls.json"
  printf '$ (cd %s && node mcp-client.mjs)  # speaks JSON-RPC to `flisk mcp`; calls: %s\n' "$cwd" "$calls"
  node "$E2E_LIB/mcp-client.mjs" --cwd "$cwd" "$OUT/$name.calls.json" >"$OUT/$name.out" || die "MCP client failed"
  jq -c '{protocol: .initialize.protocolVersion, tools: [.tools[].name], isError: [.calls[].result.isError]}' "$OUT/$name.out"
}
# mcp_structured <name> <call index>: write that call's structuredContent to $OUT/<name>.<index>.json.
mcp_structured() { jq -c ".calls[$2].result.structuredContent" "$OUT/$1.out" >"$OUT/$1.$2.json"; }

# ------------------------------------------------------------------------------------------------------------- housekeeping

e2e_diagnostics() {
  mkdir -p "$ARTIFACTS"
  [ -d "$DIR" ] && (
    cd "$DIR"
    flisk status --json >"$ARTIFACTS/tdk-status.json" 2>&1 || true
    flisk logs --json >"$ARTIFACTS/tdk-logs.json" 2>&1 || true
    cp up.log "$ARTIFACTS/up.log" 2>/dev/null || true
  )
  docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' >"$ARTIFACTS/docker-ps.txt" 2>&1 || true
  local resource c
  for resource in ${RESOURCES[@]+"${RESOURCES[@]}"}; do
    for c in $(resource_containers "$resource" 2>/dev/null); do
      docker logs "$c" >"$ARTIFACTS/docker-logs-$resource-$c.txt" 2>&1 || true
    done
  done
  tilt get uiresources >"$ARTIFACTS/tilt-resources.txt" 2>&1 || true
  tilt get uiresources -o json >"$ARTIFACTS/tilt-resources.json" 2>&1 || true
  [ -d "$OUT" ] && cp -R "$OUT" "$ARTIFACTS/case-output" 2>/dev/null || true
  echo "diagnostics written to $ARTIFACTS"
}

# Remove everything the scratch project created: the stack, its containers, volumes and networks, and the directory.
e2e_cleanup() {
  [ -d "$DIR" ] && (cd "$DIR" && flisk down >/dev/null 2>&1 || true)
  docker rm -f $(docker ps -aq --filter "name=^${PROJECT}-" 2>/dev/null) >/dev/null 2>&1 || true
  docker volume ls -q | grep -E "^${PROJECT}-" | xargs docker volume rm >/dev/null 2>&1 || true
  docker network ls --format '{{.Name}}' | grep -E "^${PROJECT}_" | xargs docker network rm >/dev/null 2>&1 || true
  rm -rf "$DIR"
}

# The case ids in CI order, from the suite's suite.json.
e2e_cases() { node -e 'console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).cases.join(" "))' "$SUITE_DIR/suite.json"; }

e2e_main() {
  local cases c
  cases="$(e2e_cases)" || die "cannot read cases from $SUITE_DIR/suite.json"
  if [ "$#" -eq 0 ]; then echo "usage: $0 <case>... | all | list | self-check | diagnostics | cleanup  (cases: $cases)" >&2; exit 2; fi
  for c in "$@"; do
    case "$c" in
      list) echo "$cases" ;;
      diagnostics) e2e_diagnostics ;;
      cleanup) e2e_cleanup ;;
      self-check) # every case in suite.json is a function in run.sh
        local id missing=""
        for id in $cases; do declare -F "$id" >/dev/null || missing="$missing $id"; done
        [ -z "$missing" ] || die "suite.json lists cases that run.sh does not define:$missing"
        echo "ok: $SUITE_NAME defines all cases: $cases" ;;
      all) # every case in order; diagnostics on failure; cleanup either way
        trap 'rc=$?; [ "$rc" -eq 0 ] || e2e_diagnostics; e2e_cleanup; exit "$rc"' EXIT
        for id in $cases; do "$id"; echo "PASS $id"; done ;;
      *)
        [[ " $cases " == *" $c "* ]] || die "unknown case: $c (cases: $cases)"
        "$c"; echo "PASS $c" ;;
    esac
  done
}
