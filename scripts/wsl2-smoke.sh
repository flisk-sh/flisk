#!/usr/bin/env bash
# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
set -euo pipefail

if [ "$#" -gt 1 ]; then
  echo "usage: bash scripts/wsl2-smoke.sh [WORK_DIRECTORY]" >&2
  exit 2
fi

remove_work_dir=false
if [ "$#" -eq 1 ]; then
  mkdir -p "$1"
  work_dir="$(cd "$1" && pwd)"
else
  work_dir="$(mktemp -d -t tdk-wsl2-smoke.XXXXXX)"
  remove_work_dir=true
fi

project_dir="$work_dir/tdk-example"
tdk_pid=""

cleanup() {
  status=$?
  trap - EXIT
  if [ "$status" -ne 0 ] && [ -f "$project_dir/up.log" ]; then
    echo "WSL2 smoke failed; flisk up output:" >&2
    tail -120 "$project_dir/up.log" >&2 || true
  fi
  if [ -n "$tdk_pid" ]; then
    kill "$tdk_pid" 2>/dev/null || true
  fi
  if [ -d "$project_dir" ]; then
    (cd "$project_dir" && flisk down >/dev/null 2>&1) || true
  fi
  if [ "$remove_work_dir" = true ]; then
    rm -rf "$work_dir"
  fi
  exit "$status"
}
trap cleanup EXIT

flisk project example --path "$project_dir"
cd "$project_dir"
flisk project --yes
# The default example uses PostgreSQL and NATS; keep optional Infisical resources off.
sed -i 's/^INFISICAL_ENABLED=.*/INFISICAL_ENABLED=false/' .env
doctor_output="$(flisk doctor --strict 2>&1)"
printf '%s\n' "$doctor_output"
ingress_port="$(printf '%s\n' "$doctor_output" | sed -nE 's/.*HTTP ([0-9]+),.*/\1/p' | head -1)"
if [ -z "$ingress_port" ]; then
  echo "Could not determine the HTTP ingress port from flisk doctor output" >&2
  exit 1
fi
flisk config verify

flisk up shop >up.log 2>&1 &
tdk_pid=$!
for _ in $(seq 1 75); do
  if grep -q 'Running tilt up' up.log; then break; fi
  if ! kill -0 "$tdk_pid" 2>/dev/null; then
    cat up.log
    echo "flisk up exited before Tilt started" >&2
    exit 1
  fi
  sleep 2
done
if ! grep -q 'Running tilt up' up.log; then
  tail -120 up.log
  echo "flisk up did not start Tilt within 150 seconds" >&2
  exit 1
fi

api="http://api.tdk-example.localhost:$ingress_port/api/orders"
app="http://app.tdk-example.localhost:$ingress_port/orders-app/"
routes_ready=false
for _ in $(seq 1 90); do
  if curl -fsS "$api/health" >/dev/null 2>&1 && curl -fsS "$api/worker-ready" >/dev/null 2>&1 && curl -fsS "$app" >/dev/null 2>&1; then
    routes_ready=true
    break
  fi
  sleep 2
done
if [ "$routes_ready" != true ]; then
  echo "Routed endpoints did not become healthy at ingress port $ingress_port" >&2
  for url in "$api/health" "$api/worker-ready" "$app"; do
    curl -sS -o /dev/null -w "$url: HTTP %{http_code}\n" "$url" || true
  done
  exit 1
fi

check_routed_response() {
  label="$1"
  url="$2"
  expected="$3"
  response="$(curl -sS -w $'\n%{http_code}' "$url")"
  status="${response##*$'\n'}"
  body="${response%$'\n'*}"
  if [ "$status" != 200 ] || [[ "$body" != *"$expected"* ]]; then
    printf '%s failed: HTTP %s; body: %s\n' "$label" "$status" "$body" >&2
    return 1
  fi
  printf '%s: HTTP %s; body: %s\n' "$label" "$status" "$body"
}

check_routed_response 'API health via Traefik' "$api/health" '"ok":true'
check_routed_response 'Worker readiness via Traefik' "$api/worker-ready" '"ready":true'
check_routed_response 'Orders app via Traefik' "$app" '<title>Flisk Orders</title>'

curl -fsS -X POST "$api" -H 'content-type: application/json' \
  -d '{"item":"WSL2 smoke test"}' -o "${TMPDIR:-/tmp}/tdk-wsl2-order.json"
order_id="$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).order.id))' "${TMPDIR:-/tmp}/tdk-wsl2-order.json")"
echo "Created order $order_id through Traefik"

observed=false
for _ in $(seq 1 60); do
  result="$(curl -fsS "$api/$order_id")"
  seen="$(printf '%s' "$result" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).order.workerSeenAt ? "yes" : "no"))')"
  if [ "$seen" = yes ]; then observed=true; break; fi
  sleep 1
done
if [ "$observed" != true ]; then
  echo "NATS worker did not observe order $order_id" >&2
  exit 1
fi
echo "NATS worker observed order $order_id"
echo "WSL2 smoke passed; stopping the example"
