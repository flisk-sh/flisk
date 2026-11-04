#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Night City: a human and AI agents on the native runtime, with a real PostgreSQL container.
#
#   human --POST /gigs--> netwatch (HTTP API) --rows--> PostgreSQL (neon-db, a ready-made image started by `flisk up`)
#   dispatcher (rule-based agent) splits each gig into jobs; fixer-1..3 claim and finish them over HTTP.
#
# Every service is a local process (a `command` in service.json) except neon-db, which is a postgres image that `flisk up` starts
# with `docker run` (a mixed run, see docs/run-without-docker.md). Services reach each other on localhost ports: a native run has
# no service DNS. There is no model and no secret: the dispatcher is a set of rules and the database accepts trust
# authentication on 127.0.0.1 only. The project is copied from tests/e2e/journeys/night-city/project/.
#
#   NC1  `flisk up` starts the database container, the migrator, netwatch, the dispatcher and three fixers; all are ready, natively.
#   NC2  The explicit migrator (appType migrator, a one-shot job) created the schema, once, and finished before netwatch.
#   NC3  A human posts a gig to POST /gigs (a bad body is a 400). The dispatcher splits it into four jobs with the right kinds,
#        fixers finish them, and the finished gig and its results are rows in PostgreSQL.
#   NC4  Concurrency: a gig of nine jobs. All three fixers work at the same time, every job is claimed exactly once and
#        finished by the worker that claimed it.
#   NC5  Chaos: kill -9 netwatch. The supervisor starts it again, the finished gig is unchanged, and a new gig still completes.
#   NC6  Chaos: kill -9 a fixer that holds a claim. The supervisor starts it again, the claim expires, another attempt finishes
#        the job, and the claim log shows both attempts.
#   NC7  `flisk down` leaves no process, port, container or run state, and the next `flisk up` would start from a clean slate.
#
#   tests/e2e/journeys/night-city/run.sh all     every case in order, then cleanup
#   tests/e2e/journeys/night-city/run.sh NC4     one case (it creates and starts the project itself when needed)
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init night-city night-city-e2e

NETWATCH="http://localhost:4600"
DB_PORT=4650
# `flisk up` names a mixed run's container flisk-<project>-<service>.
DB_CONTAINER="flisk-$PROJECT-neon-db"
SERVICES='["neon-db","db-migrate","netwatch","dispatcher","fixer-1","fixer-2","fixer-3"]'
APP_PORTS=(4600 4601 4611 4612 4613)
# A fixer holds a claim for WORK_MS (2 s); netwatch gives a claim up after CLAIM_MS (6 s). Both are set in the service.json files.
CLAIM_WAIT=90

e2e_cleanup() {
  [ -f "$DIR/.flisk/project.json" ] && (cd "$DIR" && flisk down >/dev/null 2>&1 || true)
  docker rm -f $(docker ps -aq --filter "name=^${DB_CONTAINER}\$" 2>/dev/null) >/dev/null 2>&1 || true
  rm -rf "$DIR"
}

# Native runs have no Tilt and no Compose containers: collect what a native run leaves.
e2e_diagnostics() {
  mkdir -p "$ARTIFACTS"
  if [ -d "$DIR" ]; then
    (cd "$DIR" && flisk status --json >"$ARTIFACTS/flisk-status.json" 2>&1 || true)
    cp "$DIR/up.log" "$ARTIFACTS/up.log" 2>/dev/null || true
    cp "$DIR/.flisk/native/run.json" "$ARTIFACTS/run.json" 2>/dev/null || true
    cp -R "$DIR/.flisk/native/logs" "$ARTIFACTS/native-logs" 2>/dev/null || true
    curl -fsS --max-time 5 "$NETWATCH/gigs" >"$ARTIFACTS/gigs.json" 2>&1 || true
  fi
  docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' >"$ARTIFACTS/docker-ps.txt" 2>&1 || true
  docker logs "$DB_CONTAINER" >"$ARTIFACTS/postgres.log" 2>&1 || true
  sql "select 'gigs', count(*) from gigs union all select 'jobs', count(*) from jobs union all select 'claims', count(*) from job_claims" \
    >"$ARTIFACTS/table-counts.txt" 2>&1 || true
  sql "select * from job_claims order by job_id, attempt" >"$ARTIFACTS/job-claims.txt" 2>&1 || true
  [ -d "$OUT" ] && cp -R "$OUT" "$ARTIFACTS/case-output" 2>/dev/null || true
  echo "diagnostics written to $ARTIFACTS"
}

# ------------------------------------------------------------------------------------------------------------- helpers

sql() { docker exec "$DB_CONTAINER" psql -h 127.0.0.1 -p "$DB_PORT" -U nc -d nightcity -tAq -c "$1"; } # <statement>: unaligned rows
run_state_pids() { jq -r '[.pid] + [.services[].pid] | map(select(. != null)) | .[]' "$DIR/.flisk/native/run.json"; }
listening_pid() { # <port>: the pid of the process listening on it (the run state keeps the shell that starts a service)
  if command -v ss >/dev/null 2>&1; then ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2
  else lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1; fi
}
pid_listening_changed() { local now; now="$(listening_pid "$1")"; [ -n "$now" ] && [ "$now" != "$2" ]; } # <port> <old pid>
port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; } # <port>: something accepts a connection
ports_free() { local p; for p in "$@"; do if port_open "$p"; then return 1; fi; done; } # <port>...
all_ready() { # flisk status --json reports the native runtime and every Night City service ready
  (cd "$DIR" && flisk status --json) | jq -e --argjson names "$SERVICES" \
    '.data.runtime == "native" and ([.data.resources[] | select(.status == "ready") | .name] | sort) == ($names | sort)'
}
netwatch_up() { curl -fsS --max-time 3 "$NETWATCH/health"; }
submit_gig() { # <title>: a human's request; prints the new gig's id
  curl -fsS --max-time 10 -X POST "$NETWATCH/gigs" -H 'content-type: application/json' \
    -d "$(jq -cn --arg t "$1" '{title:$t}')" | jq -er .id
}
gig_json() { curl -fsS --max-time 10 "$NETWATCH/gigs/$1"; } # <gig id>
gig_done() { [ "$(gig_json "$1" | jq -er .gig.status)" = done ]; } # <gig id>
sql_is() { [ "$(sql "$1")" = "$2" ] || die "expected '$2' from: $1 (got '$(sql "$1")')"; } # <statement> <expected value> a failed check ends the case

ensure_project() {
  [ -f "$DIR/netwatch/service.json" ] && return 0
  rm -rf "$DIR"
  mkdir -p "$DIR/.flisk"
  cp -R "$SUITE_DIR/project/." "$DIR/"
  printf '{"project":{"name":"%s"}}\n' "$PROJECT" >"$DIR/.flisk/project.json"
}
ensure_up() {
  ensure_project
  if ! all_ready >/dev/null 2>&1; then
    # --json keeps the output machine-readable; the run stays in the foreground of the background job, like the swarm's.
    (cd "$DIR" && nohup flisk up --json >>"$DIR/up.log" 2>&1 &)
  fi
  poll_until "flisk status lists the database, the migrator, netwatch, the dispatcher and three fixers ready, natively" 240 all_ready
}

NC1() { # everything starts and is ready
  log "NC1 flisk up starts the database container and the local processes"
  [ -f "$DIR/.flisk/native/run.json" ] && (cd "$DIR" && flisk down >/dev/null 2>&1 || true)
  rm -rf "$DIR"
  ensure_up
  [ -n "$(docker ps -q --filter "name=^${DB_CONTAINER}\$" --filter status=running)" ] || die "the PostgreSQL container $DB_CONTAINER is not running"
  docker ps --filter "name=^${DB_CONTAINER}\$" --format '{{.Ports}}' | grep -q "127.0.0.1:$DB_PORT->" \
    || die "PostgreSQL is not published on loopback only"
  run status status --json
  [ "$RC" -eq 0 ] || die "flisk status --json exited $RC"
  assert check "$OUT/status.out" \
    'j.data.resources.filter((r) => r.name.startsWith("fixer-")).length === 3 && j.data.resources.filter((r) => r.name.startsWith("fixer-")).every((r) => r.directUrl === `http://localhost:${r.port}`)' \
    "three fixers, each reached on its own localhost port"
}

NC2() { # the migrator is an explicit one-shot resource and ran once
  log "NC2 the explicit migrator created the schema"
  ensure_up
  sql_is "select string_agg(table_name, ',' order by table_name) from information_schema.tables where table_schema = 'public'" \
    "gigs,job_claims,jobs,schema_migrations"
  sql_is "select count(*) from schema_migrations" 1
  # A job is not a service: its state is a finished run, with no process of its own.
  run status status --json
  assert check "$OUT/status.out" 'j.data.resources.some((r) => r.name === "db-migrate" && r.status === "ready")' "the migrator reads as finished"
  [ -s "$DIR/.flisk/native/logs/db-migrate.log" ] || die "the migrator wrote no log"
  grep -q "migrations are up to date" "$DIR/.flisk/native/logs/db-migrate.log" || die "the migrator did not report finishing"
}

NC3() { # a human posts a gig; the agent and the workers finish it; PostgreSQL has the result
  log "NC3 a human posts a gig over HTTP"
  ensure_up
  # A bad request is refused, so the endpoint is a real one and not a stub.
  [ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$NETWATCH/gigs" -H 'content-type: application/json' -d '{"title":""}')" = 400 ] \
    || die "an empty title was not a 400"
  [ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$NETWATCH/gigs" -H 'content-type: application/json' -d 'not json')" = 400 ] \
    || die "a body that is not JSON was not a 400"
  local id
  id="$(submit_gig "Scout the docks. Hack the terminal. Extract the data. Escape through the tunnels")"
  poll_until "gig $id done" 60 gig_done "$id"
  gig_json "$id" | jq -e '
      .gig.status == "done"
      and ([.jobs[].kind] == ["recon","intrusion","extraction","exfil"])
      and ([.jobs[].seq] == [1,2,3,4])
      and all(.jobs[]; .status == "done" and .attempts == 1 and (.worker | test("^fixer-[123]$")) and (.worker as $w | .result | contains($w)))
      and (.gig.result | contains("finished recon job \"Scout the docks\"") and contains("finished exfil job"))' >/dev/null \
    || { gig_json "$id" | jq .; die "gig $id was not split and finished as the rules say"; }
  # The same facts, read from PostgreSQL itself and not from the API.
  sql_is "select status from gigs where id = $id" done
  sql_is "select count(*) from jobs where gig_id = $id and status = 'done'" 4
  sql_is "select count(*) from job_claims where job_id in (select id from jobs where gig_id = $id) and finished_at is not null" 4
}

NC4() { # three workers at once, no job claimed twice
  log "NC4 nine jobs, three fixers at the same time"
  ensure_up
  local id jobs="(select id from jobs where gig_id = %s)"
  id="$(submit_gig "Job one. Job two. Job three. Job four. Job five. Job six. Job seven. Job eight. Job nine")"
  poll_until "gig $id done" "$CLAIM_WAIT" gig_done "$id"
  # shellcheck disable=SC2059
  jobs="$(printf "$jobs" "$id")"
  sql_is "select count(*) from jobs where gig_id = $id" 9
  # One claim per job: nobody took a job twice, and nothing was retried.
  sql_is "select count(*) from job_claims where job_id in $jobs" 9
  sql_is "select count(*) from (select job_id from job_claims where job_id in $jobs group by job_id having count(*) > 1) d" 0
  sql_is "select count(*) from jobs where gig_id = $id and (attempts <> 1 or status <> 'done')" 0
  # The worker that finished a job is the worker that claimed it.
  sql_is "select count(*) from jobs j join job_claims c on c.job_id = j.id and c.attempt = j.attempts where j.gig_id = $id and j.worker <> c.worker" 0
  # All three workers took part, and at some moment three claims were open together.
  sql_is "select count(distinct worker) from job_claims where job_id in $jobs" 3
  local overlap
  overlap="$(sql "select max(n) from (select count(*) n from job_claims a join job_claims b on b.claimed_at <= a.claimed_at and b.finished_at > a.claimed_at where a.job_id in $jobs and b.job_id in $jobs group by a.job_id) s")"
  [ "${overlap:-0}" -ge 3 ] || die "at most $overlap claims were open together, expected 3"
  echo "workers: $(sql "select worker || '=' || count(*) from job_claims where job_id in $jobs group by worker order by worker" | tr '\n' ' ') overlap=$overlap"
}

NC5() { # the API dies; the data is in PostgreSQL
  log "NC5 kill -9 netwatch"
  ensure_up
  local id before after pid
  id="$(submit_gig "Scout the alley. Extract the ledger")"
  poll_until "gig $id done" 60 gig_done "$id"
  before="$(gig_json "$id" | jq -S .)"
  pid="$(listening_pid 4600)"
  [ -n "$pid" ] || die "nothing listens on netwatch's port 4600"
  log "kill -9 netwatch (pid $pid)"
  kill -9 "$pid"
  poll_until "the supervisor starts netwatch again" 60 pid_listening_changed 4600 "$pid"
  poll_until "the restarted netwatch answers" 60 netwatch_up
  after="$(gig_json "$id" | jq -S .)"
  [ "$before" = "$after" ] || { diff <(echo "$before") <(echo "$after") || true; die "gig $id changed across the netwatch restart"; }
  id="$(submit_gig "Hack the vault. Escape by rooftop")"
  poll_until "gig $id done after the restart" 60 gig_done "$id"
}

NC6() { # a fixer dies holding a claim
  log "NC6 kill -9 a fixer that holds a claim"
  ensure_up
  local victim=fixer-1 port=4611 attempt id job before caught=0
  # A job takes 2 s, but finding the claim and killing the process takes a moment, so now and then the claim finished first.
  # That is a miss, not a failure: try again (up to 5 times) and fail only when no attempt ever caught a held claim.
  for attempt in 1 2 3 4 5; do
    poll_until "$victim listens on $port" 60 bash -c "(exec 3<>/dev/tcp/127.0.0.1/$port)"
    id="$(submit_gig "Job a. Job b. Job c. Job d. Job e. Job f")"
    job=""
    poll_until "$victim holds a claim in gig $id (attempt $attempt)" 30 bash -c "[ -n \"\$(docker exec $DB_CONTAINER psql -h 127.0.0.1 -p $DB_PORT -U nc -d nightcity -tAq -c \"select id from jobs where gig_id = $id and status = 'claimed' and worker = '$victim' limit 1\")\" ]" || continue
    job="$(sql "select id from jobs where gig_id = $id and status = 'claimed' and worker = '$victim' limit 1")"
    before="$(listening_pid "$port")"
    if [ -z "$job" ] || [ -z "$before" ] || ! kill -9 "$before" 2>/dev/null; then
      log "the claim was gone before the kill (a miss, attempt $attempt)"
      poll_until "gig $id done" "$CLAIM_WAIT" gig_done "$id" || true
      continue
    fi
    log "kill -9 $victim (pid $before) while it holds job $job of gig $id"
    poll_until "the supervisor starts $victim again" 60 pid_listening_changed "$port" "$before"
    poll_until "gig $id done after the claim expired" "$CLAIM_WAIT" gig_done "$id"
    if [ "$(sql "select attempts from jobs where id = $job")" = 1 ]; then
      log "job $job was finished before the kill landed (a miss, attempt $attempt)"
      continue
    fi
    # The retry: more than one attempt, the first one is the killed fixer's and never finished, the last one did.
    sql_is "select status from jobs where id = $job" done
    [ "$(sql "select attempts from jobs where id = $job")" -ge 2 ] || die "job $job was not retried"
    sql_is "select worker from job_claims where job_id = $job and attempt = 1" "$victim"
    sql_is "select count(*) from job_claims where job_id = $job and attempt = 1 and finished_at is null" 1
    sql_is "select count(*) from job_claims where job_id = $job and finished_at is not null" 1
    sql_is "select count(*) from job_claims where job_id = $job" "$(sql "select attempts from jobs where id = $job")"
    # No other job was lost or run twice: six jobs, all done, each finished by the worker of its last claim.
    sql_is "select count(*) from jobs where gig_id = $id and status = 'done'" 6
    sql_is "select count(*) from jobs j join job_claims c on c.job_id = j.id and c.attempt = j.attempts where j.gig_id = $id and j.worker <> c.worker" 0
    poll_until "the whole project is ready again" 120 all_ready
    caught=1
    break
  done
  [ "$caught" -eq 1 ] || die "no attempt caught $victim holding a claim in 5 tries"
}

NC7() { # flisk down leaves nothing behind
  log "NC7 flisk down, then nothing is left"
  ensure_up
  local pids listeners="" p
  pids="$(run_state_pids)"
  [ -n "$pids" ] || die "the run state records no pids"
  for p in "${APP_PORTS[@]}"; do listeners="$listeners $(listening_pid "$p")"; done
  run down down --yes
  [ "$RC" -eq 0 ] || die "flisk down exited $RC"
  poll_until "every Night City port is free" 60 ports_free "${APP_PORTS[@]}" "$DB_PORT"
  for p in $pids $listeners; do
    ! kill -0 "$p" 2>/dev/null || die "process $p is still alive after flisk down"
  done
  [ -z "$(docker ps -aq --filter "name=${DB_CONTAINER}")" ] || die "the PostgreSQL container is still there after flisk down"
  [ -z "$(docker ps -aq --filter "label=sh.flisk.native-root=$DIR")" ] || die "a container of this run is still there after flisk down"
  [ ! -e "$DIR/.flisk/native/run.json" ] || die "the native run state file is still there after flisk down"
  # A run that is down has no ready service.
  run status-after status --json
  ! jq -e '[.data.resources[]? | select(.status == "ready")] | length > 0' "$OUT/status-after.out" >/dev/null 2>&1 \
    || die "flisk status still reports ready services after flisk down"
}

e2e_main "$@"
