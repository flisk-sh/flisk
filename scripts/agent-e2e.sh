#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# End-to-end checks for the AI agent surface (#1268): the `agent` resource, `tdk agent sessions`, `tdk restart` and the MCP
# tools, run against a real `tdk up` stack. Each case is one named function, so a CI step (and a person) can run a single case:
#
#   scripts/agent-e2e.sh <case> [<case> ...]       e.g.  scripts/agent-e2e.sh A1 A2 A3
#   scripts/agent-e2e.sh list                     print the case ids in the order CI runs them
#   scripts/agent-e2e.sh diagnostics              collect failure artifacts into $AGENT_E2E_ARTIFACTS
#   scripts/agent-e2e.sh cleanup                  tdk down and remove the scratch project
#
# Needs: tdk on PATH, Docker, Tilt, Node 22+, jq, curl. D1-D3 need only the repository checkout.
# State lives under $AGENT_E2E_ROOT (default $RUNNER_TEMP/agent-e2e or $TMPDIR/agent-e2e). There are no fixed sleeps:
# waiting is `poll_until` with a deadline, which prints what it waited for and dumps diagnostics when it runs out.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
helpers="$repo_root/scripts/agent-e2e"
E2E_ROOT="${AGENT_E2E_ROOT:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/agent-e2e}"
PROJECT="${AGENT_E2E_PROJECT:-agente2e}"
STACK=shop
AGENT=bot
DIR="$E2E_ROOT/$PROJECT"
OUT="$E2E_ROOT/out"
ARTIFACTS="${AGENT_E2E_ARTIFACTS:-$E2E_ROOT/artifacts}"
READY_TIMEOUT="${AGENT_E2E_READY_TIMEOUT:-1200}"
mkdir -p "$E2E_ROOT" "$OUT"

log() { printf '\n== %s\n' "$*"; }
die() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
now_ms() { node -p 'Date.now()'; }
assert() { node "$helpers/assert-json.mjs" "$@" || die "assertion failed: $*"; }

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

# run <name> <args...>: run tdk in the project, echo the command and its raw output (evidence), keep stdout in $OUT/<name>.out.
# Sets RC to the exit code and ELAPSED_MS to the wall time. Never aborts the script itself.
run() {
  local name="$1"; shift
  local start; start="$(now_ms)"
  printf '$ tdk %s\n' "$*"
  set +e
  (cd "$DIR" && tdk "$@") >"$OUT/$name.out" 2>"$OUT/$name.err"
  RC=$?
  set -e
  ELAPSED_MS=$(( $(now_ms) - start ))
  cat "$OUT/$name.out"
  [ -s "$OUT/$name.err" ] && { echo "[stderr]"; cat "$OUT/$name.err"; }
  echo "[exit $RC, ${ELAPSED_MS}ms]"
}

status_json() { (cd "$DIR" && tdk status --json 2>/dev/null); }
agent_port() { status_json | jq -r --arg n "$AGENT" '.data.resources[] | select(.name==$n) | .port'; }
traefik_url() { status_json | jq -r --arg n "$AGENT" '.data.resources[] | select(.name==$n) | .url'; }
container_id() { docker ps -aq --filter "name=${PROJECT}-.*-$AGENT-" | head -1; }
running_container() { docker ps -q --filter "name=${PROJECT}-.*-$AGENT-" --filter status=running | head -1; }

# curl through Traefik: the route is api.<project>.localhost:<http port>/api/<agent>; resolve the host to loopback ourselves.
via_traefik() { # <path> [curl args...]
  local path="$1"; shift
  local base host port
  base="$(traefik_url)"; host="$(echo "$base" | sed -E 's#^https?://([^:/]+).*#\1#')"; port="$(echo "$base" | sed -nE 's#^https?://[^:/]+:([0-9]+).*#\1#p')"; port="${port:-80}"
  curl -sS --max-time 20 --resolve "$host:$port:127.0.0.1" "$@" "$base$path"
}
direct() { curl -sS --max-time 20 "$@"; } # <curl args...> <url>
turn_via_traefik() { # <session id> <input> -> body on stdout
  via_traefik /turn -X POST -H "x-session-id: $1" -H 'content-type: application/json' -d "{\"input\":\"$2\"}"
}
agent_ready() { [ "$(via_traefik /ready -o /dev/null -w '%{http_code}')" = "200" ]; }
wait_agent_ready() { poll_until "agent $AGENT answers /ready 200 through Traefik" "$READY_TIMEOUT" agent_ready; }

start_up() {
  (cd "$DIR" && nohup tdk up "$STACK" >>"$DIR/up.log" 2>&1 &)
}
# After `tdk up` the status reports the resource; wait for both that and a ready agent.
wait_stack() {
  poll_until "tdk status lists $AGENT with a Traefik url" "$READY_TIMEOUT" bash -c "cd '$DIR' && tdk status --json | jq -e --arg n '$AGENT' '.data.resources[] | select(.name==\$n) | .url'"
  wait_agent_ready
}

# ---------------------------------------------------------------------------------------------------------------- A: happy path

A1() { # scaffold the project and the agent
  log "A1 scaffold: tdk project --yes, tdk resource $AGENT --type agent"
  rm -rf "$DIR"; mkdir -p "$DIR"
  (cd "$DIR" && git init -q .)
  run a1-project project --yes; [ "$RC" -eq 0 ] || die "tdk project --yes exited $RC"
  run a1-resource resource "$AGENT" --type agent --stack "$STACK" --yes; [ "$RC" -eq 0 ] || die "tdk resource exited $RC"
  local src="$DIR/services/$STACK/$AGENT/src/index.ts"
  [ -f "$src" ] || die "scaffolded agent source missing: $src"
  # The scaffold tells you to replace runTurn. Do what a user does: report which instance answered (for the sticky-routing
  # check) and support a slow turn (for the drain check), logging when a turn starts so the test can wait for it.
  node - "$src" <<'JS'
const fs = require("node:fs");
const file = process.argv[2];
const text = fs.readFileSync(file, "utf8");
const marker = /return 'received ' \+ input \+ ' \(turn ' \+ Math\.ceil\(checkpoint\.messages\.length \/ 2\) \+ '\)';/;
if (!marker.test(text)) { console.error("scaffold runTurn changed; update agent-e2e.sh"); process.exit(1); }
fs.writeFileSync(file, text.replace(marker, [
  "const slow = /^slow:(\\d+)$/.exec(input);",
  "  if (slow) {",
  "    console.log('[e2e] slow turn started');",
  "    await new Promise((resolve) => setTimeout(resolve, Number(slow[1])));",
  "  }",
  "  return 'received ' + input + ' (turn ' + Math.ceil(checkpoint.messages.length / 2) + ') from ' + (process.env.HOSTNAME ?? 'unknown');",
].join("\n")));
JS
  grep -q "slow turn started" "$src" || die "runTurn patch not applied"
  echo "scaffolded $DIR (agent $AGENT in stack $STACK)"
}

A2() { # tdk up, poll until the agent is ready
  log "A2 tdk up and bounded wait for $AGENT"
  : >"$DIR/up.log"
  start_up
  echo '$ tdk up '"$STACK"'  (background, log: up.log)'
  wait_stack
  run a2-status status --json
  assert check "$OUT/a2-status.out" "j.errors.length === 0 && j.data.resources.some(r => r.name === '$AGENT' && r.type === 'agent')" "tdk status --json lists $AGENT as an agent"
}

A3() { # /health and /ready through Traefik; the agent publishes no host port
  log "A3 /health and /ready through Traefik"
  local port; port="$(agent_port)"
  echo "agent port: $port; traefik url: $(traefik_url)"
  local code
  code="$(via_traefik /health -o /dev/null -w '%{http_code}')"; echo "traefik GET /health -> $code"; [ "$code" = 200 ] || die "traefik /health returned $code"
  code="$(via_traefik /ready -o /dev/null -w '%{http_code}')"; echo "traefik GET /ready -> $code"; [ "$code" = 200 ] || die "traefik /ready returned $code"
  # The agent container publishes no host port: Traefik is the only way in, and `tdk agent sessions` uses the same route.
  code="$(direct "http://127.0.0.1:$port/health" -o /dev/null -w '%{http_code}' || true)"; echo "direct GET :$port/health -> ${code:-000} (expected: not published)"
  [ "${code:-000}" != 200 ] || die "agent port $port answers on the host; the docs say agents are reached through Traefik"
}

A4() { # a checkpoint through Traefik, read back with tdk agent sessions
  log "A4 session checkpoint envelope"
  local body; body="$(turn_via_traefik s1 hello)"; echo "POST /turn (x-session-id: s1) -> $body"
  echo "$body" >"$OUT/a4-turn.out"
  assert check "$OUT/a4-turn.out" "j.sessionId === 's1' && j.turns === 1 && j.reply.startsWith('received hello')" "the turn was answered and checkpointed"
  run a4-sessions agent sessions "$AGENT" --session-id s1 --json
  [ "$RC" -eq 0 ] || die "tdk agent sessions exited $RC"
  assert check "$OUT/a4-sessions.out" "typeof j.schemaVersion === 'number' && Array.isArray(j.errors) && j.errors.length === 0" "envelope has schemaVersion and errors: []"
  assert check "$OUT/a4-sessions.out" "j.data.agent === '$AGENT' && Number.isInteger(j.data.port)" "data.agent and data.port are set by the CLI"
  assert check "$OUT/a4-sessions.out" "j.data.session && j.data.session.sessionId === 's1' && j.data.session.messages.length === 2" "the checkpoint is nested under data.session"
  assert check "$OUT/a4-sessions.out" "!('messages' in j.data) && !('sessionId' in j.data)" "checkpoint fields are not spread into data"
}

A5() { # sticky routing: same session id -> same instance
  log "A5 sticky routing through Traefik"
  local first="" body who i
  for i in 1 2 3 4 5; do
    body="$(turn_via_traefik s-sticky "ping $i")"
    who="$(echo "$body" | sed -E 's/.* from ([^"]+)".*/\1/')"
    echo "s-sticky request $i answered by instance: $who"
    [ -n "$first" ] || first="$who"
    [ "$who" = "$first" ] || die "session s-sticky moved from instance $first to $who"
  done
  body="$(turn_via_traefik s-other "ping")"; echo "s-other answered by instance: $(echo "$body" | sed -E 's/.* from ([^"]+)".*/\1/') (may differ; this stack runs one replica)"
}

A6() { # tdk restart, healthy again, checkpoint intact
  log "A6 tdk restart $AGENT"
  local before; before="$(running_container)"
  run a6-restart restart "$AGENT" --json
  [ "$RC" -eq 0 ] || die "tdk restart exited $RC"
  assert envelope "$OUT/a6-restart.out"
  assert check "$OUT/a6-restart.out" "j.errors.length === 0 && j.data.resource === '$AGENT' && j.data.restarted === true" "restart envelope is { resource, restarted: true }"
  # Tilt rebuilds and recreates the container; wait for a ready agent that is a different container.
  poll_until "agent container replaced after restart" "$READY_TIMEOUT" bash -c "[ \"\$(docker ps -q --filter 'name=${PROJECT}-.*-$AGENT-' --filter status=running | head -1)\" != '$before' ]" || \
    echo "container id unchanged after restart; falling back to readiness only"
  wait_agent_ready
  run a6-sessions agent sessions "$AGENT" --session-id s1 --json
  [ "$RC" -eq 0 ] || die "tdk agent sessions after restart exited $RC"
  assert check "$OUT/a6-sessions.out" "j.data.session.messages.length === 2 && j.data.session.messages[0].content === 'hello'" "checkpoint s1 survived the restart"
}

# Graceful drain: SIGTERM while a slow turn is in flight; the turn must complete and the checkpoint must be whole.
A8() {
  log "A8 graceful drain: SIGTERM during an in-flight turn"
  local cid; cid="$(running_container)"; [ -n "$cid" ] || die "no running $AGENT container"
  turn_via_traefik s-drain "slow:5000" >"$OUT/a8-turn.out" 2>"$OUT/a8-turn.err" &
  local turn_pid=$!
  poll_until "the slow turn to start (log line)" 60 bash -c "docker logs '$cid' 2>&1 | grep -q 'slow turn started'"
  echo "$ docker kill --signal=SIGTERM $cid  (turn is in flight)"
  docker kill --signal=SIGTERM "$cid" >/dev/null
  wait "$turn_pid" || die "the in-flight turn did not complete (curl failed: $(cat "$OUT/a8-turn.err"))"
  echo "in-flight turn answered: $(cat "$OUT/a8-turn.out")"
  assert check "$OUT/a8-turn.out" "j.sessionId === 's-drain' && j.reply.startsWith('received slow:5000')" "the in-flight turn completed with its reply"
  poll_until "container to exit after draining" 60 bash -c "[ -z \"\$(docker ps -q --filter id=$cid --filter status=running)\" ]"
  docker logs "$cid" 2>&1 | grep 'draining' | tee "$OUT/a8-drain.log"
  grep -q 'draining 1 in-flight' "$OUT/a8-drain.log" || die "the agent did not report draining the in-flight request"
  echo "exit code of drained container: $(docker inspect -f '{{.State.ExitCode}}' "$cid")"
  [ "$(docker inspect -f '{{.State.ExitCode}}' "$cid")" = 0 ] || die "drained container did not exit 0"
  # Bring it back through Tilt and read the checkpoint: it must parse and hold the drained turn (not truncated).
  run a8-restart restart "$AGENT" --json
  [ "$RC" -eq 0 ] || die "tdk restart after drain exited $RC"
  wait_agent_ready
  run a8-sessions agent sessions "$AGENT" --session-id s-drain --json
  [ "$RC" -eq 0 ] || die "tdk agent sessions exited $RC"
  assert check "$OUT/a8-sessions.out" "j.data.session.messages.length === 2 && j.data.session.messages[1].content.startsWith('received slow:5000')" "checkpoint holds the drained turn, whole"
}

# Durability across tdk down / tdk up, and removal with docker volume rm.
A7() {
  log "A7 durability across tdk down / tdk up, and docker volume rm"
  turn_via_traefik s-durable "remember me" >"$OUT/a7-turn.out"; cat "$OUT/a7-turn.out"; echo
  stack_cycle() { # down, up, wait
    run "a7-down-$1" down; [ "$RC" -eq 0 ] || die "tdk down exited $RC"
    : >"$DIR/up.log"; start_up; wait_stack
  }
  stack_cycle 1
  run a7-after-up agent sessions "$AGENT" --session-id s-durable --json
  [ "$RC" -eq 0 ] || die "tdk agent sessions exited $RC"
  assert check "$OUT/a7-after-up.out" "j.data.session.messages.length === 2 && j.data.session.messages[0].content === 'remember me'" "checkpoint survived tdk down / tdk up"
  echo "--- now remove the named volume"
  run a7-down-2 down; [ "$RC" -eq 0 ] || die "tdk down exited $RC"
  local vol; vol="$(docker volume ls -q | grep -E "^${PROJECT}-${STACK}.*${AGENT}-agent-state\$" || true)"
  echo "volume: $vol"
  [ "$(echo "$vol" | grep -c .)" = 1 ] || die "expected exactly one agent-state volume, got: '$vol'"
  docker volume rm "$vol"
  : >"$DIR/up.log"; start_up; wait_stack
  run a7-after-rm agent sessions "$AGENT" --session-id s-durable --json
  [ "$RC" -eq 0 ] || die "tdk agent sessions exited $RC"
  assert check "$OUT/a7-after-rm.out" "j.data.session.messages.length === 0" "checkpoint is gone after docker volume rm (documented behavior)"
}

# ---------------------------------------------------------------------------------------------------------------- B: error paths

# Stop the real container (Tilt stays up) so Traefik has no live backend for the agent.
B0() {
  log "B0 stop the agent container (Tilt stays up)"
  local cid; cid="$(running_container)"; [ -n "$cid" ] || die "no running $AGENT container"
  docker stop -t 15 "$cid" >/dev/null
  echo "stopped container $cid"
  tdk_jq_check() { (cd "$DIR" && tdk status --json >/dev/null); }
  tilt get uiresources >/dev/null 2>&1 || die "Tilt is not reachable after stopping the container"
}

with_stub() { # <mode> <args...>  starts a stub standing in for the ingress; the CLI is pointed at it via TDK_SERVICE_BASE_URL
  local port; port="$(agent_port)"
  node "$helpers/stub.mjs" "$1" "$port" "${@:2}" >"$OUT/stub.log" 2>&1 &
  STUB_PID=$!
  poll_until "stub to listen on $port" 20 grep -q listening "$OUT/stub.log"
  export TDK_SERVICE_BASE_URL="http://127.0.0.1:$port"
}
stop_stub() { unset TDK_SERVICE_BASE_URL; kill "$STUB_PID" 2>/dev/null || true; wait "$STUB_PID" 2>/dev/null || true; }

B1() { # AGENT_NOT_RUNNING with nothing listening
  log "B1 AGENT_NOT_RUNNING (container stopped)"
  [ -z "$(docker ps -q --filter "name=${PROJECT}-.*-$AGENT-" --filter status=running)" ] || die "agent container is still running; run B0 first"
  run b1-json agent sessions "$AGENT" --session-id s1 --json
  [ "$RC" -eq 1 ] || die "expected exit 1, got $RC"
  assert envelope "$OUT/b1-json.out" AGENT_NOT_RUNNING
  run b1-human agent sessions "$AGENT" --session-id s1
  [ "$RC" -eq 1 ] || die "expected exit 1, got $RC"
  grep -q 'tdk up' "$OUT/b1-human.out" "$OUT/b1-human.err" || die "human error has no 'tdk up' hint"
  ! grep -qE '^\s+at .*:[0-9]+:[0-9]+' "$OUT/b1-human.out" "$OUT/b1-human.err" || die "human error shows a stack trace"
}

b_timeout() { # <mode> <label>
  with_stub "$1"
  run "b-$1" agent sessions "$AGENT" --session-id s1 --json
  stop_stub
  [ "$RC" -eq 1 ] || die "expected exit 1, got $RC"
  assert envelope "$OUT/b-$1.out" AGENT_NOT_RUNNING
  echo "elapsed: ${ELAPSED_MS}ms (bound: 9000-15000)"
  [ "$ELAPSED_MS" -ge 9000 ] && [ "$ELAPSED_MS" -le 15000 ] || die "$2 took ${ELAPSED_MS}ms, expected 9000-15000"
}
B2() { log "B2 timeout: stub accepts the connection and never replies"; b_timeout hang "timeout"; }
B3() { log "B3 stalled body: stub sends headers, then stalls"; b_timeout stall "stalled body"; }

B4() { # AGENT_REQUEST_FAILED with the status and the agent's error text
  log "B4 AGENT_REQUEST_FAILED"
  local code text
  for pair in "400:x-session-id header is required" "500:internal_error"; do
    code="${pair%%:*}"; text="${pair#*:}"
    with_stub status "$code" "$text"
    run "b4-$code" agent sessions "$AGENT" --session-id s1 --json
    stop_stub
    [ "$RC" -eq 1 ] || die "expected exit 1, got $RC"
    assert envelope "$OUT/b4-$code.out" AGENT_REQUEST_FAILED
    assert check "$OUT/b4-$code.out" "j.errors[0].message.includes('$code') && j.errors[0].message.includes('$text')" "message includes status $code and the agent's error text"
  done
}

A4b() { # reply shapes: an array stays an array; agent/port keys in the reply cannot overwrite data.agent / data.port
  log "A4b envelope nesting with hostile replies (stub)"
  with_stub json '{"agent":"spoofed","port":1,"messages":["x"]}'
  run a4b-object agent sessions "$AGENT" --session-id s1 --json
  stop_stub
  [ "$RC" -eq 0 ] || die "expected exit 0, got $RC"
  assert check "$OUT/a4b-object.out" "j.data.agent === '$AGENT' && j.data.port !== 1 && j.data.session.agent === 'spoofed' && j.data.session.port === 1" "reply keys agent/port stay inside data.session"
  with_stub json '[{"id":"a"}]'
  run a4b-array agent sessions "$AGENT" --session-id s1 --json
  stop_stub
  [ "$RC" -eq 0 ] || die "expected exit 0, got $RC"
  assert check "$OUT/a4b-array.out" "Array.isArray(j.data.session) && j.data.session[0].id === 'a'" "an array reply stays an array"
}

B5() { # TILT_TRIGGER_FAILED (Tilt is up)
  log "B5 TILT_TRIGGER_FAILED"
  run b5 restart no-such-resource --json
  [ "$RC" -eq 1 ] || die "expected exit 1, got $RC"
  assert envelope "$OUT/b5.out" TILT_TRIGGER_FAILED
  assert check "$OUT/b5.out" "j.errors[0].message.includes('no-such-resource')" "Tilt's error text names the resource"
}

B6() { # SESSION_ID_REQUIRED: nothing listens, so any request would have produced AGENT_NOT_RUNNING instead
  log "B6 SESSION_ID_REQUIRED before any request"
  run b6 agent sessions "$AGENT" --json
  [ "$RC" -eq 1 ] || die "expected exit 1, got $RC"
  assert envelope "$OUT/b6.out" SESSION_ID_REQUIRED
}

B7() { # UNKNOWN_RESOURCE, NOT_AN_AGENT, NO_PORT: one smoke each
  log "B7 UNKNOWN_RESOURCE, NOT_AN_AGENT, NO_PORT"
  run b7-unknown agent sessions no-such-resource --session-id s1 --json
  [ "$RC" -eq 1 ] || die "expected exit 1, got $RC"
  assert envelope "$OUT/b7-unknown.out" UNKNOWN_RESOURCE
  # The other two need resources the live project does not have: use a throwaway project (no stack needed).
  local tmp; tmp="$(mktemp -d)"
  mkdir -p "$tmp/.tdk" "$tmp/services/api" "$tmp/services/noport"
  echo '{}' >"$tmp/.tdk/project.json"
  echo '{"appName":"api","appType":"backend","port":4000}' >"$tmp/services/api/service.json"
  echo '{"appName":"noport","appType":"agent"}' >"$tmp/services/noport/service.json"
  for pair in "api:NOT_AN_AGENT" "noport:NO_PORT"; do
    local name="${pair%%:*}" code="${pair#*:}"
    printf '$ (cd throwaway-project && tdk agent sessions %s --session-id s1 --json)\n' "$name"
    set +e; (cd "$tmp" && tdk agent sessions "$name" --session-id s1 --json) >"$OUT/b7-$name.out" 2>"$OUT/b7-$name.err"; RC=$?; set -e
    cat "$OUT/b7-$name.out"; echo "[exit $RC]"
    [ "$RC" -eq 1 ] || die "expected exit 1, got $RC"
    assert envelope "$OUT/b7-$name.out" "$code"
  done
  rm -rf "$tmp"
}

B8() { # TILT_NOT_RUNNING after tdk down
  log "B8 TILT_NOT_RUNNING after tdk down"
  run b8-down down; [ "$RC" -eq 0 ] || die "tdk down exited $RC"
  run b8 restart "$AGENT" --json
  [ "$RC" -eq 1 ] || die "expected exit 1, got $RC"
  assert envelope "$OUT/b8.out" TILT_NOT_RUNNING
}

# ---------------------------------------------------------------------------------------------------------------- C: MCP over stdio

mcp() { # <name> <calls json> [cwd]  -> $OUT/<name>.out
  local name="$1" calls="$2" cwd="${3:-$DIR}"
  echo "$calls" >"$OUT/$name.calls.json"
  printf '$ (cd %s && node mcp-client.mjs)  # speaks JSON-RPC to `tdk mcp`; calls: %s\n' "$cwd" "$calls"
  node "$helpers/mcp-client.mjs" --cwd "$cwd" "$OUT/$name.calls.json" >"$OUT/$name.out" || die "MCP client failed"
  jq -c '{protocol: .initialize.protocolVersion, tools: [.tools[].name], isError: [.calls[].result.isError]}' "$OUT/$name.out"
}
structured() { jq -c ".calls[$2].result.structuredContent" "$OUT/$1.out" >"$OUT/$1.$2.json"; }

C1() {
  log "C1 tdk mcp: initialize and tools/list"
  mcp c1 '[]'
  assert check "$OUT/c1.out" "['list_agents','get_agent_sessions','restart_resource'].every(n => j.tools.some(t => t.name === n))" "tools/list includes list_agents, get_agent_sessions, restart_resource"
  assert check "$OUT/c1.out" "j.tools.find(t => t.name === 'get_agent_sessions').inputSchema.required.includes('sessionId')" "get_agent_sessions requires sessionId"
}

C2() { # each tool's payload equals the CLI --json envelope
  log "C2 MCP tool payloads equal the CLI --json envelopes"
  mcp c2 '[{"tool":"list_agents"},{"tool":"get_agent_sessions","arguments":{"resource":"bot","sessionId":"s1"}}]'
  assert check "$OUT/c2.out" "j.calls.every(c => c.result && c.result.isError === false)" "list_agents and get_agent_sessions succeed"
  structured c2 0; structured c2 1
  run c2-cli-list resources --type=agent --json
  run c2-cli-sessions agent sessions "$AGENT" --session-id s1 --json
  assert equal "$OUT/c2.0.json" "$OUT/c2-cli-list.out"
  assert equal "$OUT/c2.1.json" "$OUT/c2-cli-sessions.out"
  local before; before="$(running_container)"
  mcp c2r '[{"tool":"restart_resource","arguments":{"resource":"bot"}}]'
  structured c2r 0
  assert check "$OUT/c2r.out" "j.calls[0].result.isError === false" "restart_resource succeeds"
  wait_agent_ready
  run c2-cli-restart restart "$AGENT" --json
  assert equal "$OUT/c2r.0.json" "$OUT/c2-cli-restart.out"
  wait_agent_ready
}

C3() { # projectPath from another cwd; an unknown resource is a structured tool error and the server survives
  log "C3 MCP projectPath from another cwd, and structured errors"
  local elsewhere; elsewhere="$(mktemp -d)"
  mcp c3a "[{\"tool\":\"get_agent_sessions\",\"arguments\":{\"projectPath\":\"$DIR\",\"resource\":\"bot\",\"sessionId\":\"s1\"}}]" "$elsewhere"
  structured c3a 0
  assert check "$OUT/c3a.0.json" "j.errors.length === 0 && j.data.agent === '$AGENT' && j.data.session.sessionId === 's1'" "projectPath resolves the project from a different cwd"
  mcp c3b '[{"tool":"get_agent_sessions","arguments":{"resource":"no-such-resource","sessionId":"s1"}},{"tool":"get_agent_sessions","arguments":{"resource":"bot"}},{"tool":"restart_resource","arguments":{"resource":"no-such-resource"}},{"tool":"list_agents"}]'
  structured c3b 0; structured c3b 2
  assert check "$OUT/c3b.0.json" "j.errors[0].code === 'UNKNOWN_RESOURCE'" "unknown resource: structured error envelope"
  assert check "$OUT/c3b.out" "j.calls[0].result.isError === true" "unknown resource: isError is true"
  assert check "$OUT/c3b.out" "j.calls[1].result.isError === true && j.calls[1].result.content[0].text.includes('sessionId is required')" "missing sessionId is a tool error naming the field"
  assert check "$OUT/c3b.2.json" "j.errors[0].code === 'TILT_TRIGGER_FAILED'" "restart_resource on an unknown resource: structured error"
  assert check "$OUT/c3b.out" "j.calls[3].result.isError === false" "the server still answers after the failed calls"
  rm -rf "$elsewhere"
}

# ---------------------------------------------------------------------------------------------------------------- D: distribution and docs

D1() {
  log "D1 .claude/skills <-> .agents/skills symlinks"
  cd "$repo_root"
  local bad=0 d name link
  for d in .claude/skills/*/; do
    name="$(basename "$d")"; link=".agents/skills/$name"
    if [ ! -L "$link" ]; then echo "missing symlink: $link"; bad=1
    elif [ ! -e "$link/SKILL.md" ]; then echo "symlink does not resolve to a skill: $link -> $(readlink "$link")"; bad=1
    else echo "ok  $link -> $(readlink "$link")"; fi
  done
  for link in .agents/skills/*; do
    [ -L "$link" ] || continue
    [ -e "$link" ] || { echo "dangling symlink: $link -> $(readlink "$link")"; bad=1; }
  done
  [ "$bad" -eq 0 ] || die "skill symlinks are inconsistent"
  [ -d .claude/skills/tdk-agent-ops ] || die "tdk-agent-ops skill is missing"
}

D2() {
  log "D2 sync-tdk-skills.sh keeps tdk-agent-ops and deletes a skill removed upstream"
  local tmp; tmp="$(mktemp -d)"
  mkdir -p "$tmp/repo/scripts" "$tmp/repo/.claude" "$tmp/repo/.agents"
  cp "$repo_root/scripts/sync-tdk-skills.sh" "$tmp/repo/scripts/"
  cp -R "$repo_root/.claude/skills" "$tmp/repo/.claude/skills"
  cp -R "$repo_root/.agents/skills" "$tmp/repo/.agents/skills"
  # A skill the previous sync brought in that the source repo no longer has.
  mkdir -p "$tmp/repo/.claude/skills/removed-upstream"; echo "# gone" >"$tmp/repo/.claude/skills/removed-upstream/SKILL.md"
  ln -sfn ../../.claude/skills/removed-upstream "$tmp/repo/.agents/skills/removed-upstream"
  # Fixture source repo: one kept skill and one new one.
  mkdir -p "$tmp/src/.claude-plugin" "$tmp/src/plugins/tdk-cli/.claude-plugin" "$tmp/src/skills/kept-upstream" "$tmp/src/skills/new-upstream"
  echo '{"name":"fixture","plugins":[]}' >"$tmp/src/.claude-plugin/marketplace.json"
  echo '{"name":"tdk-cli"}' >"$tmp/src/plugins/tdk-cli/.claude-plugin/plugin.json"
  echo "# kept" >"$tmp/src/skills/kept-upstream/SKILL.md"; echo "# new" >"$tmp/src/skills/new-upstream/SKILL.md"
  (cd "$tmp/repo" && TDK_SKILLS_REPO="$tmp/src" bash scripts/sync-tdk-skills.sh) || die "sync-tdk-skills.sh failed on the fixture"
  ls -l "$tmp/repo/.agents/skills"
  [ -f "$tmp/repo/.claude/skills/tdk-agent-ops/SKILL.md" ] || die "tdk-agent-ops was deleted by the sync"
  [ -e "$tmp/repo/.agents/skills/tdk-agent-ops/SKILL.md" ] || die "the .agents/skills/tdk-agent-ops link no longer resolves"
  [ ! -e "$tmp/repo/.claude/skills/removed-upstream" ] || die "a skill removed upstream survived in .claude/skills"
  [ ! -L "$tmp/repo/.agents/skills/removed-upstream" ] || die "a skill removed upstream survived in .agents/skills"
  for n in kept-upstream new-upstream; do
    [ -f "$tmp/repo/.claude/skills/$n/SKILL.md" ] && [ -e "$tmp/repo/.agents/skills/$n/SKILL.md" ] || die "upstream skill $n was not synced"
  done
  rm -rf "$tmp"
}

D3() {
  log "D3 link, anchor and removed-file check over README.md, docs/** and AGENTS.md"
  (cd "$repo_root" && node scripts/agent-e2e/check-docs.mjs) || die "documentation check failed"
}

# ---------------------------------------------------------------------------------------------------------------- housekeeping

diagnostics() {
  mkdir -p "$ARTIFACTS"
  [ -d "$DIR" ] && (
    cd "$DIR"
    tdk status --json >"$ARTIFACTS/tdk-status.json" 2>&1 || true
    tdk logs --json >"$ARTIFACTS/tdk-logs.json" 2>&1 || true
    cp up.log "$ARTIFACTS/up.log" 2>/dev/null || true
  )
  docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' >"$ARTIFACTS/docker-ps.txt" 2>&1 || true
  for c in $(docker ps -aq --filter "name=${PROJECT}-.*-$AGENT-" 2>/dev/null); do
    docker logs "$c" >"$ARTIFACTS/docker-logs-$AGENT-$c.txt" 2>&1 || true
  done
  tilt get uiresources >"$ARTIFACTS/tilt-resources.txt" 2>&1 || true
  tilt get uiresources -o json >"$ARTIFACTS/tilt-resources.json" 2>&1 || true
  [ -d "$OUT" ] && cp -R "$OUT" "$ARTIFACTS/case-output" 2>/dev/null || true
  echo "diagnostics written to $ARTIFACTS"
}

cleanup() {
  [ -d "$DIR" ] && (cd "$DIR" && tdk down >/dev/null 2>&1 || true)
  docker rm -f $(docker ps -aq --filter "name=^${PROJECT}-" 2>/dev/null) >/dev/null 2>&1 || true
  docker volume ls -q | grep -E "^${PROJECT}-" | xargs docker volume rm >/dev/null 2>&1 || true
  docker network ls --format '{{.Name}}' | grep -E "^${PROJECT}_" | xargs docker network rm >/dev/null 2>&1 || true
  rm -rf "$DIR"
}

CASES="D1 D2 D3 A1 A2 A3 A4 A5 A6 C1 C2 C3 A8 B0 B1 B2 B3 B4 A4b B5 B6 B7 A7 B8"
if [ "$#" -eq 0 ]; then echo "usage: $0 <case>... | list | diagnostics | cleanup  (cases: $CASES)" >&2; exit 2; fi
for c in "$@"; do
  case "$c" in
    list) echo "$CASES" ;;
    diagnostics) diagnostics ;;
    cleanup) cleanup ;;
    *) if declare -F "$c" >/dev/null; then "$c"; echo "PASS $c"; else die "unknown case: $c"; fi ;;
  esac
done
