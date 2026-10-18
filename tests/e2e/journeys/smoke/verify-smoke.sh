#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# Check the `smoke` manifest block through a real `tdk up`, in an isolated throwaway project.
#   Phase 1: a backend with an in-memory /records API declares a smoke block (POST a record, GET it back by the saved id).
#            `tdk up` must print "Smoke check passed" and keep running.
#   Phase 2: the same service.json points a step at a route the service does not have. `tdk up` must print "Smoke check failed"
#            with the URL and status, and exit non-zero. The retained record (.tdk/smoke/<service>/read-back/latest.json) must hold
#            the public URL, status 404 and a non-empty body, and phase 1's last-success copy must still be there.
# VERIFY_SMOKE_ARTIFACT_DIR: when set, the project's .tdk/smoke records are copied there on exit (pass or fail) for CI to upload.
# Needs Docker, Tilt, and a built CLI (cli/dist). Uses a unique project name and random alternate ports, and removes only the
# containers, networks and images carrying that name (it never calls `tdk down`).
#
# Usage: tests/e2e/journeys/smoke/verify-smoke.sh        (VERIFY_WAIT_SECONDS bounds each phase, default 900)
set -euo pipefail

root="$(cd "$(dirname "$0")/../../../.." && pwd)"
proj="smk$$"
work="$(mktemp -d)/$proj"
mkdir -p "$work"
http_port=$((30000 + RANDOM % 2000))
tdk() { TDK_EXTENSION_SOURCE="$root" node "$root/cli/bin/tdk.js" "$@"; }

cleanup() {
  if [ -n "${VERIFY_SMOKE_ARTIFACT_DIR:-}" ] && [ -d "$work/.tdk/smoke" ]; then
    mkdir -p "$VERIFY_SMOKE_ARTIFACT_DIR" && cp -R "$work/.tdk/smoke/." "$VERIFY_SMOKE_ARTIFACT_DIR/" || true
  fi
  pkill -f "tilt up.*$proj" >/dev/null 2>&1 || true
  docker rm -f $(docker ps -aq --filter "name=$proj") >/dev/null 2>&1 || true
  docker network ls --format '{{.Name}}' | grep "^${proj}" | xargs -r docker network rm >/dev/null 2>&1 || true
  docker images --format '{{.Repository}}:{{.Tag}}' | grep -E "^${proj}_" | xargs -r docker rmi -f >/dev/null 2>&1 || true
  docker images --format '{{.Repository}}:{{.Tag}}' | grep -E "^${proj}-l[0-9]+" | xargs -r docker rmi -f >/dev/null 2>&1 || true
}
trap cleanup EXIT

cd "$work"
git init -q .
tdk project --yes >/dev/null 2>&1
# Exported, not written to .env: `tdk up` reads these from its own environment when it prints and checks the public URLs.
export TDK_HTTP_PORT="$http_port" TDK_HTTPS_PORT="$((32000 + RANDOM % 2000))" TDK_POSTGRES_PORT="$((34000 + RANDOM % 2000))"
tdk resource "$proj" --type backend --stack app --yes >/dev/null
svc="services/app/$proj"

cat > "$svc/src/index.ts" <<'TS'
import { Hono } from 'hono';

const app = new Hono();
const records = new Map<string, { id: string; name: string }>();

app.get('/health', (c) => c.json({ status: 'ok' }));
app.post('/records', async (c) => {
  const { name } = await c.req.json();
  const id = crypto.randomUUID();
  records.set(id, { id, name });
  return c.json({ id, name }, 201);
});
app.get('/records/:id', (c) => {
  const record = records.get(c.req.param('id'));
  return record ? c.json(record) : c.json({ error: 'not found' }, 404);
});

export default { port: process.env.PORT || 3000, fetch: app.fetch };
TS

set_smoke() { # $1 = path of the read-back step
  SMOKE_READ="$1" python3 - "$svc/service.json" <<'PY'
import json, os, sys
p = sys.argv[1]
d = json.load(open(p))
d["smoke"] = {
    "via": "proxy",
    "timeoutSeconds": 20 if "missing" in os.environ["SMOKE_READ"] else 600,
    "steps": [
        {"name": "create", "method": "POST", "path": "/records", "body": {"name": "smoke"}, "expect": 201, "save": {"id": "$.id"}},
        {"name": "read back", "path": os.environ["SMOKE_READ"], "expect": 200, "bodyContains": "smoke"},
    ],
}
json.dump(d, open(p, "w"), indent=2)
PY
}

wait_for() { # $1 = pattern, $2 = pid
  for _ in $(seq 1 "${VERIFY_WAIT_SECONDS:-900}"); do
    grep -q "$1" "$work/up.log" 2>/dev/null && return 0
    kill -0 "$2" 2>/dev/null || { grep -q "$1" "$work/up.log" 2>/dev/null && return 0; return 1; }
    sleep 1
  done
  return 1
}

# Phase 1: a correct smoke block passes.
set_smoke '/records/{{id}}'
: > up.log
nohup node "$root/cli/bin/tdk.js" up app >"$work/up.log" 2>&1 &
pid=$!
if ! wait_for "Smoke check passed: $proj" "$pid"; then
  echo "FAIL smoke phase 1: no 'Smoke check passed' line" >&2
  tail -30 up.log >&2
  exit 1
fi
pass_line="$(grep "Smoke check passed: $proj" up.log | tail -1)"
if ! kill -0 "$pid" 2>/dev/null; then
  echo "FAIL smoke phase 1: tdk up exited after a passing smoke check" >&2
  exit 1
fi
pkill -f "tilt up.*$proj" >/dev/null 2>&1 || true
wait "$pid" 2>/dev/null || true

# Phase 2: a step that hits a missing route fails tdk up.
set_smoke '/missing/{{id}}'
: > up.log
set +e
node "$root/cli/bin/tdk.js" up app >"$work/up.log" 2>&1 &
pid=$!
wait_for "Smoke check failed" "$pid"
wait "$pid"
code=$?
set -e
fail_line="$(grep "Smoke check failed" up.log | tail -1 || true)"
record_dir="$work/.tdk/smoke/$proj/read-back"
record_error="$(python3 - "$record_dir" "$proj" <<'PY'
import json, os, sys
d, proj = sys.argv[1], sys.argv[2]
try:
    r = json.load(open(os.path.join(d, "latest.json")))
    body = open(os.path.join(d, "body.txt")).read()
    last_ok = open(os.path.join(d, "last-success-body.txt")).read()
except Exception as e:
    print(f"cannot read record in {d}: {e}"); sys.exit(0)
if f"/api/{proj}/missing/" not in r.get("url", ""): print(f"record url is {r.get('url')!r}")
elif r.get("status") != 404: print(f"record status is {r.get('status')!r}")
elif not body.strip(): print("record body is empty")
elif "smoke" not in last_ok: print("last-success body from phase 1 is missing")
PY
)"
if [ "$code" != "0" ] && echo "$fail_line" | grep -q "/api/$proj/missing/" && echo "$fail_line" | grep -q "404" \
  && echo "$fail_line" | grep -q "record: .*latest.json" && [ -z "$record_error" ]; then
  echo "PASS smoke: through tdk up and Traefik. Good block -> '$pass_line'. Missing route -> exit $code, '$fail_line'. Record kept in $record_dir"
else
  [ -n "$record_error" ] && echo "FAIL smoke record: $record_error" >&2
  echo "FAIL smoke phase 2: exit=$code line='$fail_line'" >&2
  tail -30 up.log >&2
  exit 1
fi

# Verification note for the summary gate fix (throwaway, not for merge).
