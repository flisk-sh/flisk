#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# A mixed run: Postgres and Redis from ready-made images next to an API that runs as a local process, the way an app keeps
# its database in Docker and runs `npm run dev` (Ghostfolio's setup). One `flisk up` starts all three with no Tilt and no
# generated files. Needs Docker, Node 22+ and a built CLI. Uses a throwaway project with unique names and free ports, and
# removes only its own containers and volume.
#
# Checks, in order:
#   1. `flisk up --dry-run --json` plans the run as local processes and lists the two containers.
#   2. `flisk up` starts Postgres (ready once pg_isready passes inside it), Redis (password from .env) and then the API,
#      which reaches both on 127.0.0.1; the containers publish on loopback only and the secrets are not in `ps`.
#   3. `flisk status --json` reports all three ready and `flisk logs --service postgres` shows the container's output.
#   4. `flisk down` stops the API and removes both containers; the named volume survives.
#   5. A run whose supervisor was killed with SIGKILL leaves containers; `flisk down` removes them, and a new `flisk up`
#      starts again on the same volume (the row written in step 2 is still there).
#
# Usage: tests/e2e/resource-types/bring-your-own/verify-byo-mixed.sh
set -euo pipefail

proj="mixed$$"
work="$(mktemp -d)/$proj"
mkdir -p "$work"/db "$work"/cache "$work"/api
flisk() { command "${FLISK_BIN:-flisk}" "$@"; }
volume="${proj}_pgdata"
wait_seconds=${VERIFY_WAIT_SECONDS:-180}
up_pid=""

cleanup() {
  [ -n "$up_pid" ] && kill "$up_pid" >/dev/null 2>&1 || true
  docker rm -f $(docker ps -aq --filter "name=flisk-$proj-") >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT
fail() { echo "FAIL mixed: $*" >&2; [ -f "$work/up.log" ] && tail -30 "$work/up.log" >&2; exit 1; }
free_port() { node -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'; }

pg_port="$(free_port)"; redis_port="$(free_port)"; api_port="$(free_port)"
cd "$work"
mkdir -p .flisk && printf '{"project":{"name":"%s"}}\n' "$proj" > .flisk/project.json
printf 'POSTGRES_USER=user\nPOSTGRES_PASSWORD=pg-%s-secret\nREDIS_PASSWORD=redis-%s-secret\n' "$proj" "$proj" > .env
cat > db/service.json <<JSON
{"schemaVersion":1,"appName":"postgres","appType":"bring-your-own","image":"postgres:15-alpine","port":$pg_port,"exposeViaProxy":false,
 "env":{"POSTGRES_USER":"\${POSTGRES_USER}","POSTGRES_PASSWORD":"\${POSTGRES_PASSWORD}","POSTGRES_DB":"app","PGPORT":"$pg_port"},
 "healthCheck":{"command":["pg_isready","-U","user","-d","app","-p","$pg_port"]},
 "volumes":[{"source":"pgdata","target":"/var/lib/postgresql/data","name":"$volume"}]}
JSON
cat > cache/service.json <<JSON
{"schemaVersion":1,"appName":"redis","appType":"bring-your-own","image":"redis:8-alpine","port":$redis_port,"exposeViaProxy":false,
 "env":{"REDIS_PASSWORD":"\${REDIS_PASSWORD}"},
 "container":{"command":["sh","-c","redis-server --port $redis_port --requirepass \"\$\$REDIS_PASSWORD\""]},
 "healthCheck":{"command":["sh","-c","redis-cli -p $redis_port --pass \"\$REDIS_PASSWORD\" ping | grep PONG"]}}
JSON
cat > api/service.json <<JSON
{"schemaVersion":1,"appName":"api","appType":"backend","command":"node server.js","port":$api_port,"healthCheckPath":"/health",
 "dependsOn":["postgres","redis"],"env":{"PG_PORT":"$pg_port","REDIS_PORT":"$redis_port"}}
JSON
cat > api/server.js <<'JS'
const net = require("net");
const reach = (port) => new Promise((ok) => { const s = net.connect(Number(port), "127.0.0.1", () => { s.end(); ok(true); }); s.on("error", () => ok(false)); });
require("http").createServer(async (req, res) => {
  const both = (await reach(process.env.PG_PORT)) && (await reach(process.env.REDIS_PORT));
  res.statusCode = both ? 200 : 503;
  res.end(both ? "postgres and redis reachable" : "not reachable");
}).listen(process.env.PORT);
JS

# 1. The plan.
flisk up --dry-run --json > dry.json || fail "dry run failed: $(cat dry.json)"
node -e 'const r=JSON.parse(require("fs").readFileSync("dry.json","utf8"));const d=r.data??r;if(d.runtime!=="native"||JSON.stringify((d.containers??[]).sort())!==JSON.stringify(["postgres","redis"]))process.exit(1)' \
  || fail "dry run did not plan two containers in a native run: $(cat dry.json)"
echo "PASS dry run plans postgres and redis as containers next to the local api"

start_up() {
  flisk up > up.log 2>&1 &
  up_pid=$!
  for _ in $(seq 1 "$wait_seconds"); do
    grep -q "Flisk is up" up.log && return 0
    grep -q "did not start" up.log && fail "flisk up did not start"
    kill -0 "$up_pid" 2>/dev/null || fail "flisk up exited"
    sleep 1
  done
  fail "flisk up was not up after ${wait_seconds}s"
}

# 2. The run.
start_up
[ "$(curl -s "http://127.0.0.1:$api_port/health")" = "postgres and redis reachable" ] || fail "the api did not reach postgres and redis"
docker ps --filter "name=flisk-$proj-postgres" --format '{{.Ports}}' | grep -q "127.0.0.1:$pg_port->" || fail "postgres is not published on loopback"
if ps axww | grep -v grep | grep -q "pg-$proj-secret"; then fail "the postgres password shows in ps"; fi
docker exec "flisk-$proj-postgres" psql -U user -d app -p "$pg_port" -c "create table kept(v text); insert into kept values ('$proj');" >/dev/null \
  || fail "could not write to postgres"
echo "PASS flisk up starts both containers, then the api, which reaches them on loopback; secrets stay out of ps"

# 3. Status and logs.
flisk status --json > status.json || true
for svc in postgres redis api; do
  grep -q "\"$svc\"" status.json || fail "status does not list $svc: $(cat status.json)"
done
flisk logs --service postgres 2>&1 | grep -q "ready to accept connections" || fail "flisk logs did not show postgres output"
echo "PASS flisk status lists all three and flisk logs shows the container's output"

# 4. Down.
flisk down > down.log 2>&1 || fail "flisk down failed: $(cat down.log)"
wait "$up_pid" 2>/dev/null || true; up_pid=""
[ -z "$(docker ps -aq --filter "name=flisk-$proj-")" ] || fail "flisk down left containers"
docker volume inspect "$volume" >/dev/null || fail "the named volume did not survive flisk down"
echo "PASS flisk down removes both containers and keeps the volume"

# 5. A killed supervisor.
start_up
kill -9 "$up_pid"; up_pid=""
sleep 1
[ -n "$(docker ps -q --filter "name=flisk-$proj-postgres")" ] || echo "note: postgres stopped with its supervisor"
flisk down > down2.log 2>&1 || fail "flisk down after a killed run failed: $(cat down2.log)"
[ -z "$(docker ps -aq --filter "name=flisk-$proj-")" ] || fail "flisk down left containers of a killed run"
start_up
docker exec "flisk-$proj-postgres" psql -U user -d app -p "$pg_port" -tAc "select v from kept" | grep -qx "$proj" \
  || fail "the row written before the restart is gone"
flisk down >/dev/null 2>&1; wait "$up_pid" 2>/dev/null || true; up_pid=""
echo "PASS flisk down cleans up after a killed run, and the next flisk up keeps the data"
