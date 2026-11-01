#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The multi-agent starters (`flisk project swarm`, `flisk project security`, `flisk project super-agent`) through a real `flisk up`, as local processes with no
# Docker. The chaos cases kill -9 real processes while work is in flight: the flisk up supervisor must start them again, and the
# swarm must finish the goal without losing or double-counting a subtask.
#
#   T1  `flisk project swarm --json` creates the project; a second run into the same folder fails with PROJECT_FAILED.
#   T2  The human output says it runs as local processes and does not send the user to Docker or Tilt.
#   S1  `flisk up` starts the coordinator and three workers as local processes; `flisk status --json` lists all four ready.
#   S2  A goal sent to the coordinator is split into subtasks and every one is done by a worker.
#   S3  Chaos: kill -9 a worker while it holds a claim. The supervisor starts it again (new pid), the claim expires, another
#       attempt finishes the subtask, and the goal is done.
#   S4  Chaos: kill -9 the coordinator mid-goal. The supervisor starts it again, the goal is still there (saved to disk), and the
#       workers finish it.
#   S5  `flisk down` stops every process and frees every port.
#   B1  `flisk project security` + `flisk up`: a scan of code with a hardcoded secret and a plain-http URL reports the secret as
#       critical, first; then `flisk down`.
#   P1  `flisk project super-agent` + `flisk up`: the planner, the tool server and three sub-agents are ready natively, and
#       `flisk mcp check tools --call` passes against the tool server.
#   P2  A goal is planned (rules, no API key), researched with the MCP `lookup` tool, written and checked.
#   P3  Chaos: kill -9 the tool server, then send a goal. The researcher fails while it is down; the planner backs off, the
#       supervisor starts the tool server again, and a later attempt finishes the research and the goal.
#   P4  Chaos: kill -9 the planner right after a goal. The supervisor starts it again and the goal is still there and done.
#   P5  `flisk down` stops all five and frees every port.
#
#   tests/e2e/journeys/agent-templates/run.sh all     every case in order, then cleanup
#   tests/e2e/journeys/agent-templates/run.sh S3      one case (it creates and starts the swarm itself when needed)
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init agent-templates swarm-e2e
RESOURCES=(coordinator worker-1 worker-2 worker-3)
SECURITY_DIR="$SUITE_ROOT/security-e2e"
AGENT_DIR="$SUITE_ROOT/super-agent-e2e"
PLANNER="http://localhost:4300"

# This suite runs three projects, all local processes (no containers): stop each one, even after a failed case, so no process
# keeps a port the next run needs.
e2e_cleanup() {
  local dir
  for dir in "$DIR" "$SECURITY_DIR" "$AGENT_DIR"; do
    [ -f "$dir/.flisk/native/run.json" ] && (cd "$dir" && flisk down >/dev/null 2>&1 || true)
    rm -rf "$dir"
  done
}
COORDINATOR="http://localhost:4100"
# The template's claim deadline is 15 s; a killed worker's subtask is retried after it.
CLAIM_WAIT=60

run_state() { jq -r --arg s "$1" '.services[$s].pid' "$DIR/.flisk/native/run.json"; } # <service>: its pid in the native run state
listening_pid() { # <port>: the pid of the process listening on it (the run state keeps only the first pid of a restarted service)
  if command -v ss >/dev/null 2>&1; then ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2
  else lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1; fi
}
pid_listening_changed() { local now; now="$(listening_pid "$1")"; [ -n "$now" ] && [ "$now" != "$2" ]; } # <port> <old pid>
service_alive() { local pid; pid="$(run_state "$1" 2>/dev/null)"; [ -n "$pid" ] && [ "$pid" != null ] && kill -0 "$pid" 2>/dev/null; } # <service>: its recorded pid is a live process
goals() { curl -fsS --max-time 5 "$COORDINATOR/goals"; }
goal_status() { goals | jq -er --arg id "$1" '.goals[] | select(.id==$id) | .status'; } # <goal id>
goal_done() { [ "$(goal_status "$1")" = "done" ]; }
send_goal() { # <text>: prints the new goal's id
  curl -fsS --max-time 5 -X POST "$COORDINATOR/goals" -H 'content-type: application/json' \
    -d "$(jq -cn --arg g "$1" '{goal:$g}')" | jq -er .id
}
claimed_by() { # <goal id> <worker>: the id of a subtask that worker holds right now
  goals | jq -er --arg id "$1" --arg w "$2" \
    '[.goals[] | select(.id==$id) | .subtasks[] | select(.status=="claimed" and .worker==$w) | .id][0] // empty'
}
ports_free() { # <port>...: nothing listens on any of them
  local p
  for p in "$@"; do if curl -sS --max-time 2 "http://localhost:$p/health" >/dev/null 2>&1; then return 1; fi; done
}
all_ready() { # <dir> <count>: flisk status --json reports the native runtime and that many resources, all ready
  (cd "$1" && flisk status --json) | jq -e --argjson n "$2" \
    '.data.runtime == "native" and (.data.resources | length) == $n and all(.data.resources[]; .status == "ready")'
}
pid_replaced() { local now; now="$(run_state "$1")"; [ -n "$now" ] && [ "$now" != "null" ] && [ "$now" != "$2" ]; } # <svc> <old>

ensure_project() {
  [ -f "$DIR/coordinator/service.json" ] && return 0
  rm -rf "$DIR"
  run_in "$SUITE_ROOT" swarm-create project swarm --path "$PROJECT" --json
  [ "$RC" -eq 0 ] || die "flisk project swarm exited $RC"
}
ensure_up() {
  ensure_project
  if ! all_ready "$DIR" 4 >/dev/null 2>&1; then
    (cd "$DIR" && nohup flisk up --json >>"$DIR/up.log" 2>&1 &)
  fi
  poll_until "flisk status lists the coordinator and three workers ready, natively" 120 all_ready "$DIR" 4
}

T1() { # the project is created, and creating it again into the same folder is an error envelope
  log "T1 flisk project swarm --json, twice"
  # A swarm still running from an earlier case would keep its ports after its folder is gone.
  [ -f "$DIR/.flisk/native/run.json" ] && (cd "$DIR" && flisk down >/dev/null 2>&1 || true)
  rm -rf "$DIR"
  run_in "$SUITE_ROOT" swarm-create project swarm --path "$PROJECT" --json
  [ "$RC" -eq 0 ] || die "flisk project swarm exited $RC"
  assert check "$OUT/swarm-create.out" 'j.data.template === "swarm" && j.errors.length === 0' "the envelope names the swarm template"
  local f
  for f in coordinator/server.mjs worker/server.mjs worker-1/service.json worker-2/service.json worker-3/service.json README.md; do
    [ -f "$DIR/$f" ] || die "the swarm project has no $f"
  done
  run_in "$SUITE_ROOT" swarm-again project swarm --path "$PROJECT" --json
  [ "$RC" -ne 0 ] || die "creating the swarm into a folder that is not empty exited 0"
  assert envelope "$OUT/swarm-again.out" PROJECT_FAILED
}

T2() { # the human output sends the user to flisk up, not to Docker
  log "T2 the next steps of a generated starter"
  local tmp="$SUITE_ROOT/swarm-human"
  rm -rf "$tmp"
  run_in "$SUITE_ROOT" swarm-human project swarm --path swarm-human --yes
  [ "$RC" -eq 0 ] || die "flisk project swarm --yes exited $RC"
  grep -q "no Docker needed" "$OUT/swarm-human.out" || die "the next steps do not say the swarm runs without Docker"
  if grep -qiE "Docker/Tilt are ready|Cloned \"swarm\"" "$OUT/swarm-human.out"; then
    die "the next steps still describe a cloned Docker stack"
  fi
  rm -rf "$tmp"
}

S1() { # four local processes, all ready
  log "S1 flisk up starts the swarm as local processes"
  ensure_up
  local s
  for s in coordinator worker-1 worker-2 worker-3; do
    kill -0 "$(run_state "$s")" 2>/dev/null || die "$s has no live process in the native run state"
  done
  # No Traefik runs natively: every service, the coordinator (a backend) included, is reached on localhost at its port.
  run swarm-status status --json
  [ "$RC" -eq 0 ] || die "flisk status --json exited $RC"
  assert check "$OUT/swarm-status.out" \
    'j.data.resources.every((r) => r.url === null && r.directUrl === `http://localhost:${r.port}`)' \
    "every native service has url null and a localhost directUrl"
  curl -fsS --max-time 5 "$(jq -r '.data.resources[] | select(.name=="coordinator") | .directUrl' "$OUT/swarm-status.out")/health" >/dev/null \
    || die "the coordinator does not answer at the directUrl flisk status reports"
}

S2() { # a goal is split and finished
  log "S2 a goal is split into subtasks and finished"
  ensure_up
  local id
  id="$(send_goal "read the docs. summarize them and list the risks")"
  goals | jq -e --arg id "$id" '.goals[] | select(.id==$id) | (.subtasks | length) == 3' >/dev/null \
    || die "the goal was not split into 3 subtasks"
  poll_until "goal $id done" 60 goal_done "$id"
  goals | jq -e --arg id "$id" '.goals[] | select(.id==$id) | all(.subtasks[]; .status=="done" and (.result|type)=="string")' >/dev/null \
    || die "a subtask of goal $id has no result"
}

S3() { # chaos: a worker dies holding a claim
  log "S3 kill -9 a worker that holds a claim"
  ensure_up
  local id victim port before task attempt caught=0
  victim=worker-1
  port="$(jq -r --arg v "$victim" '.data.resources[] | select(.name==$v) | .port' "$OUT/swarm-status.out" 2>/dev/null)"
  [ -n "$port" ] && [ "$port" != null ] || port=4101
  # A subtask takes the worker 0.5 to 1.5 s, and finding the claim then killing the process takes about as long, so now and then the
  # claim is finished before the kill lands and there is nothing to retry. That is a miss, not a failure: try again with a new goal
  # (up to 5 times) and fail only when no attempt ever caught a held claim.
  for attempt in 1 2 3 4 5; do
    # After an earlier kill the supervisor is still starting the worker again: wait for a live process before the next try.
    poll_until "$victim listens on $port" 60 bash -c "[ -n \"\$(ss -ltnpH 'sport = :$port' 2>/dev/null | grep -o 'pid=[0-9]*' | head -1)\" ] || [ -n \"\$(lsof -nP -iTCP:$port -sTCP:LISTEN -t 2>/dev/null | head -1)\" ]" || true
    # Enough subtasks that every worker is busy for a while.
    id="$(send_goal "a. b. c. d. e. f. g. h. i. j. k. l")"
    if ! poll_until "$victim holds a claim on goal $id (attempt $attempt)" 30 bash -c "[ -n \"\$(curl -fsS '$COORDINATOR/goals' | jq -r --arg id '$id' --arg w '$victim' '[.goals[] | select(.id==\$id) | .subtasks[] | select(.status==\"claimed\" and .worker==\$w) | .id][0] // empty')\" ]"; then
      continue
    fi
    task="$(claimed_by "$id" "$victim")"
    [ -n "$task" ] || { log "the claim was finished before it could be read; trying again"; poll_until "goal $id done" "$CLAIM_WAIT" goal_done "$id"; continue; }
    before="$(listening_pid "$port")"
    log "kill -9 $victim (pid ${before:-none}, port $port) while it holds subtask $task"
    if [ -z "$before" ] || ! kill -9 "$before" 2>/dev/null; then
      log "$victim (pid $before) was already gone (a miss, attempt $attempt)"
      poll_until "goal $id done" "$CLAIM_WAIT" goal_done "$id" || true
      continue
    fi
    poll_until "the supervisor starts $victim again" 60 pid_listening_changed "$port" "$before"
    poll_until "goal $id done after the claim expired" "$CLAIM_WAIT" goal_done "$id"
    if goals | jq -e --arg id "$id" --arg t "$task" \
         '.goals[] | select(.id==$id) | .subtasks[] | select(.id==$t) | .attempts == 1 and .status=="done" and .error == null' >/dev/null; then
      log "the claim on $task was finished before the kill landed (a miss, attempt $attempt)"
      continue
    fi
    goals | jq -e --arg id "$id" --arg t "$task" --arg w "$victim" \
      '.goals[] | select(.id==$id) | .subtasks[] | select(.id==$t) | .attempts >= 2 and .status=="done" and (.error | test($w))' >/dev/null \
      || { goals | jq --arg t "$task" '.goals[].subtasks[] | select(.id==$t)'; die "subtask $task was not retried after $victim died"; }
    goals | jq -e --arg id "$id" '.goals[] | select(.id==$id) | all(.subtasks[]; .status=="done")' >/dev/null \
      || die "goal $id has a subtask that is not done"
    caught=1
    break
  done
  [ "$caught" -eq 1 ] || die "no attempt caught $victim holding a claim in 5 tries"
}

S4() { # chaos: the coordinator dies mid-goal
  log "S4 kill -9 the coordinator mid-goal"
  ensure_up
  local id before
  id="$(send_goal "one. two. three. four. five. six")"
  # The pid in the run state is the shell that starts the service; killing it would leave the real process holding the port and
  # the restarted one would crash with EADDRINUSE. Kill the process that listens, which is what a crash of the service is.
  before="$(listening_pid 4100)"
  [ -n "$before" ] || die "nothing listens on the coordinator's port 4100"
  log "kill -9 coordinator (pid $before, port 4100) with goal $id in flight"
  kill -9 "$before"
  poll_until "the supervisor starts the coordinator again" 60 pid_listening_changed 4100 "$before"
  poll_until "the restarted coordinator answers" 30 goals
  goals | jq -e --arg id "$id" '.goals[] | select(.id==$id)' >/dev/null || die "goal $id was lost when the coordinator died"
  poll_until "goal $id done after the coordinator restart" "$CLAIM_WAIT" goal_done "$id"
  [ -f "$DIR/coordinator/.data/swarm-state.json" ] || die "the coordinator saved no state file"
}

S5() { # flisk down stops it all
  log "S5 flisk down"
  ensure_up
  run swarm-down down
  [ "$RC" -eq 0 ] || die "flisk down exited $RC"
  poll_until "every swarm port is free" 30 ports_free 4100 4101 4102 4103
}

B1() { # the security agents report a hardcoded secret first
  log "B1 flisk project security, scan, report"
  [ -f "$SECURITY_DIR/.flisk/native/run.json" ] && (cd "$SECURITY_DIR" && flisk down >/dev/null 2>&1 || true)
  rm -rf "$SECURITY_DIR"
  run_in "$SUITE_ROOT" security-create project security --path security-e2e --json
  [ "$RC" -eq 0 ] || die "flisk project security exited $RC"
  (cd "$SECURITY_DIR" && nohup flisk up --json >>"$SECURITY_DIR/up.log" 2>&1 &)
  poll_until "the scanner, triage and reporter are ready, natively" 120 all_ready "$SECURITY_DIR" 3
  local code='const url = "http://example.com";\nconst apiKey = "abcdef123456";'
  curl -fsS --max-time 10 -X POST localhost:4200/scan -H 'content-type: application/json' \
    -d "$(jq -cn --arg c "$(printf "$code")" '{files:{"app.js":$c}}')" | jq -e '.found == 2' >/dev/null \
    || die "the scanner did not find the secret and the plain-http URL"
  poll_until "the reporter holds both findings" 30 bash -c "curl -fsS localhost:4202/report | jq -e '.total == 2'"
  curl -fsS localhost:4202/report | jq -e '[.findings[].severity] == ["critical","medium"] and .findings[0].rule == "hardcoded-secret"' >/dev/null \
    || { curl -fsS localhost:4202/report; die "the report does not put the hardcoded secret first as critical"; }
  run_in "$SECURITY_DIR" security-down down
  [ "$RC" -eq 0 ] || die "flisk down exited $RC in the security project"
  poll_until "every security port is free" 30 ports_free 4200 4201 4202
  rm -rf "$SECURITY_DIR"
}

# ------------------------------------------------------------------------------------------------------------- super agent

plans() { curl -fsS --max-time 5 "$PLANNER/goals"; }
plan_status() { plans | jq -er --arg id "$1" '.goals[] | select(.id==$id) | .status'; } # <goal id>
plan_done() { [ "$(plan_status "$1")" = "done" ]; }
send_plan() { # <text>: prints the new goal's id
  curl -fsS --max-time 30 -X POST "$PLANNER/goals" -H 'content-type: application/json' \
    -d "$(jq -cn --arg g "$1" '{goal:$g}')" | jq -er .id
}
ensure_agent_up() {
  if [ ! -f "$AGENT_DIR/planner/service.json" ]; then
    rm -rf "$AGENT_DIR"
    run_in "$SUITE_ROOT" agent-create project super-agent --path super-agent-e2e --json
    [ "$RC" -eq 0 ] || die "flisk project super-agent exited $RC"
  fi
  if ! all_ready "$AGENT_DIR" 5 >/dev/null 2>&1; then
    # No API key: the planner must plan with its rules, so the suite is free and deterministic.
    (cd "$AGENT_DIR" && ANTHROPIC_API_KEY= nohup flisk up --json >>"$AGENT_DIR/up.log" 2>&1 &)
  fi
  poll_until "flisk status lists the planner, the tool server and three sub-agents ready, natively" 120 all_ready "$AGENT_DIR" 5
}

P1() { # five local processes, and the tool server passes flisk mcp check
  log "P1 flisk project super-agent, flisk up, flisk mcp check"
  [ -f "$AGENT_DIR/.flisk/native/run.json" ] && (cd "$AGENT_DIR" && flisk down >/dev/null 2>&1 || true)
  rm -rf "$AGENT_DIR"
  ensure_agent_up
  run_in "$AGENT_DIR" agent-mcp-check mcp check tools --call --no-icon --json
  [ "$RC" -eq 0 ] || die "flisk mcp check tools exited $RC"
  assert check "$OUT/agent-mcp-check.out" 'j.data.didPass === true && j.data.serverName === "super-agent-tools"' \
    "the tool server passes every MCP check, tool calls included"
}

P2() { # a goal goes through plan, research, write and check
  log "P2 a goal is planned, researched with MCP tools, written and checked"
  ensure_agent_up
  local id
  id="$(send_plan "explain flisk and mcp")"
  poll_until "goal $id done" 60 plan_done "$id"
  plans | jq -e --arg id "$id" '.goals[] | select(.id==$id) |
      .planner == "rules" and ([.steps[].kind] == ["research","research","write","check"]) and
      (.answer | contains("local development loop") and contains("Model Context Protocol"))' >/dev/null \
    || { plans | jq --arg id "$id" '.goals[] | select(.id==$id)'; die "goal $id did not go through every step with the tool notes"; }
}

P3() { # chaos: the tool server dies, research retries after it is back
  log "P3 kill -9 the tool server, then send a goal"
  ensure_agent_up
  local before id
  before="$(listening_pid 4301)"
  [ -n "$before" ] || die "nothing listens on the tool server port 4301"
  log "kill -9 tools (pid $before)"
  kill -9 "$before"
  id="$(send_plan "retries")"
  poll_until "the supervisor starts the tool server again" 60 pid_listening_changed 4301 "$before"
  poll_until "goal $id done after the tool server restart" 60 plan_done "$id"
  plans | jq -e --arg id "$id" '.goals[] | select(.id==$id) | .steps[] | select(.kind=="research") | .attempts >= 2 and (.error | type) == "string"' >/dev/null \
    || { plans | jq --arg id "$id" '.goals[] | select(.id==$id) | .steps'; die "the research step of goal $id was not retried after the tool server died"; }
}

P4() { # chaos: the planner dies right after a goal
  log "P4 kill -9 the planner right after a goal"
  ensure_agent_up
  local before id
  id="$(send_plan "agents and retries")"
  before="$(listening_pid 4300)"
  log "kill -9 planner (pid $before) with goal $id sent"
  kill -9 "$before"
  poll_until "the supervisor starts the planner again" 60 pid_listening_changed 4300 "$before"
  poll_until "the restarted planner answers" 30 plans
  plans | jq -e --arg id "$id" '.goals[] | select(.id==$id)' >/dev/null || die "goal $id was lost when the planner died"
  poll_until "goal $id done after the planner restart" 60 plan_done "$id"
  [ -f "$AGENT_DIR/planner/.data/super-agent-state.json" ] || die "the planner saved no state file"
}

P5() { # flisk down stops all five
  log "P5 flisk down"
  ensure_agent_up
  run_in "$AGENT_DIR" agent-down down
  [ "$RC" -eq 0 ] || die "flisk down exited $RC in the super-agent project"
  poll_until "every super-agent port is free" 30 ports_free 4300 4301 4302 4303 4304
  rm -rf "$AGENT_DIR"
}

e2e_main "$@"
