#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The multi-agent starters (`flisk project swarm`, `flisk project security`) through a real `flisk up`, as local processes with no
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
COORDINATOR="http://localhost:4100"
# The template's claim deadline is 15 s; a killed worker's subtask is retried after it.
CLAIM_WAIT=60

run_state() { jq -r --arg s "$1" '.services[$s].pid' "$DIR/.flisk/native/run.json"; } # <service>: its pid in the native run state
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
  local id victim before task attempt caught=0
  victim=worker-1
  # A subtask takes the worker 0.5 to 1.5 s, and finding the claim then killing the process takes about as long, so now and then the
  # claim is finished before the kill lands and there is nothing to retry. That is a miss, not a failure: try again with a new goal
  # (up to 5 times) and fail only when no attempt ever caught a held claim.
  for attempt in 1 2 3 4 5; do
    # Enough subtasks that every worker is busy for a while.
    id="$(send_goal "a. b. c. d. e. f. g. h. i. j. k. l")"
    if ! poll_until "$victim holds a claim on goal $id (attempt $attempt)" 30 bash -c "[ -n \"\$(curl -fsS '$COORDINATOR/goals' | jq -r --arg id '$id' --arg w '$victim' '[.goals[] | select(.id==\$id) | .subtasks[] | select(.status==\"claimed\" and .worker==\$w) | .id][0] // empty')\" ]"; then
      continue
    fi
    task="$(claimed_by "$id" "$victim")"
    [ -n "$task" ] || { log "the claim was finished before it could be read; trying again"; poll_until "goal $id done" "$CLAIM_WAIT" goal_done "$id"; continue; }
    before="$(run_state "$victim")"
    log "kill -9 $victim (pid $before) while it holds subtask $task"
    kill -9 "$before"
    poll_until "the supervisor starts $victim again" 60 pid_replaced "$victim" "$before"
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
  before="$(run_state coordinator)"
  log "kill -9 coordinator (pid $before) with goal $id in flight"
  kill -9 "$before"
  poll_until "the supervisor starts the coordinator again" 60 pid_replaced coordinator "$before"
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

e2e_main "$@"
