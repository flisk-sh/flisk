#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# service.json `providers` (an external endpoint, its token and a local fallback), through a real `flisk up`.
# Needs Docker, Tilt, and a built CLI (cli/dist). Uses an isolated throwaway project with unique names and alternate ports,
# and removes only the containers, networks and images carrying its own unique project name.
#
# The service is a research agent that calls IBM Quantum with a token, or a local simulator (`quantum-sim`) without one.
# Checks, in order:
#   1. `flisk config verify` accepts the provider; `flisk up --dry-run` refuses a second provider whose token is required and
#      missing, naming the token, and starts nothing.
#   2. Without the token: the service sees the remote URL, PROVIDER_IBM_QUANTUM_REMOTE empty, no token, and the fallback URL,
#      and reaches the simulator through it.
#   3. Rotation: after the token is added to the project .env and `flisk restart <service>`, the service sees
#      PROVIDER_IBM_QUANTUM_REMOTE=true and the new token (its length; the value is never printed). The generated env file
#      never holds the token.
#
# Usage: tests/e2e/resource-types/bring-your-own/verify-byo-providers.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/../../../.." && pwd)"
fixture="$root/tests/e2e/fixtures/byo-provider-probe"
proj="prov$$"
work="$(mktemp -d)/$proj"
mkdir -p "$work"
flisk() { command "${FLISK_BIN:-flisk}" "$@"; }
res="$proj"
wait_seconds=${VERIFY_WAIT_SECONDS:-300}
token="rotated-token-0123456789"

up_pid=""
cleanup() {
  # Stop the background flisk up first: when a check fails early it is still starting Tilt and containers.
  [ -n "$up_pid" ] && kill "$up_pid" >/dev/null 2>&1 || true
  sleep 1
  pkill -f "tilt up.*$proj" >/dev/null 2>&1 || true
  docker rm -f $(docker ps -aq --filter "name=$proj") >/dev/null 2>&1 || true
  docker network ls --format '{{.Name}}' | grep "^${proj}" | xargs -r docker network rm >/dev/null 2>&1 || true
  docker images --format '{{.Repository}}:{{.Tag}}' | grep -E "^${proj}(_|-l[0-9]+)" | xargs -r docker rmi -f >/dev/null 2>&1 || true
}
trap cleanup EXIT
fail() { echo "FAIL providers: $*" >&2; [ -f "$work/up.log" ] && tail -30 "$work/up.log" >&2; exit 1; }

# Set the service's `providers` to the JSON given, with quantum-sim in dependsOn.
set_providers() { # <json>
  # Through the environment: under Bun's node shim, `node -e` arguments do not reach process.argv intact.
  SERVICE_JSON="$work/services/app/$res/service.json" PROVIDERS_JSON="$1" node -e 'const fs=require("fs"); const f=process.env.SERVICE_JSON; const m=JSON.parse(fs.readFileSync(f,"utf8")); m.dependsOn=["quantum-sim"]; m.providers=JSON.parse(process.env.PROVIDERS_JSON); fs.writeFileSync(f, JSON.stringify(m,null,2)+"\n")'
}
# One field of the service's GET /provider, through Traefik ("" when it does not answer).
provider_field() { # <field>
  { curl -s -m 5 -H "Host: api.$proj.localhost" "http://127.0.0.1:$http_port/api/$res/provider" 2>/dev/null || true; } \
    | PROVIDER_FIELD="$1" node -e 'let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{ try { const v=JSON.parse(s)[process.env.PROVIDER_FIELD]; console.log(v===undefined?"":v) } catch { console.log("") } })'
}

cd "$work"
git init -q .
flisk project --yes >/dev/null
http_port=$((30000 + RANDOM % 2000))
printf '\nFLISK_HTTP_PORT=%s\nFLISK_HTTPS_PORT=%s\nFLISK_POSTGRES_PORT=%s\n' \
  "$http_port" "$((32000 + RANDOM % 2000))" "$((34000 + RANDOM % 2000))" >> .env
for name in quantum-sim "$res"; do
  mkdir -p "services/app/$name"
  cp -R "$fixture/." "services/app/$name/"
  (cd "services/app/$name" && flisk resource "$name" --type bring-your-own --stack app \
    --register-existing --dockerfile ./Dockerfile --health-path /health --yes >/dev/null)
done
ibm='"ibm-quantum": {"url": "https://quantum.cloud.ibm.com/api", "tokenSecret": "IBM_QUANTUM_TOKEN", "fallback": "quantum-sim"}'

# 1. Validation, and a required token that is missing.
set_providers "{$ibm, \"braket\": {\"url\": \"https://braket.us-east-1.amazonaws.com\", \"tokenSecret\": \"AWS_BRAKET_TOKEN\"}}"
flisk config verify --json >"$work/verify.json" 2>&1 || fail "config verify refused the providers: $(cat "$work/verify.json")"
if flisk up app --dry-run >"$work/dry-run.log" 2>&1; then fail "up --dry-run started with AWS_BRAKET_TOKEN missing"; fi
grep -q "AWS_BRAKET_TOKEN (token of provider braket) has no value" "$work/dry-run.log" \
  || fail "up --dry-run did not name the missing provider token: $(tail -20 "$work/dry-run.log")"
grep -q "IBM_QUANTUM_TOKEN" "$work/dry-run.log" && fail "up --dry-run called IBM_QUANTUM_TOKEN required, but its provider has a fallback"
echo "PASS config verify accepts the providers, and up --dry-run refuses a required provider token that is missing"

# 2. Without the token: the fallback.
set_providers "{$ibm}"
nohup "${FLISK_BIN:-flisk}" up app >"$work/up.log" 2>&1 &
up_pid=$!
reply=""
for _ in $(seq 1 "$wait_seconds"); do
  reply="$(provider_field fallback_reply)"
  [ "$reply" = ok ] && break
  sleep 2
done
[ "$reply" = ok ] || fail "the service did not reach quantum-sim through its fallback URL (fallback_reply '$reply')"
url="$(provider_field url)" remote="$(provider_field remote)" length="$(provider_field token_length)" fallback="$(provider_field fallback_url)"
[ "$url" = "https://quantum.cloud.ibm.com/api" ] || fail "PROVIDER_IBM_QUANTUM_URL is '$url'"
[ -z "$remote" ] || fail "PROVIDER_IBM_QUANTUM_REMOTE is '$remote' without a token, expected empty"
[ "$length" = 0 ] || fail "IBM_QUANTUM_TOKEN has $length characters without a token in .env"
case "$fallback" in http://quantum-sim:[0-9]*) ;; *) fail "PROVIDER_IBM_QUANTUM_FALLBACK_URL is '$fallback'" ;; esac
echo "PASS without a token the service gets the remote URL, REMOTE empty and $fallback, and reaches the simulator"

# 3. Rotation: add the token and restart the service.
printf 'IBM_QUANTUM_TOKEN=%s\n' "$token" >> .env
flisk restart "$res" >"$work/restart.log" 2>&1 || fail "flisk restart $res failed: $(tail -10 "$work/restart.log")"
remote=""
for _ in $(seq 1 "$wait_seconds"); do
  remote="$(provider_field remote)"
  [ "$remote" = true ] && break
  sleep 2
done
[ "$remote" = true ] || fail "PROVIDER_IBM_QUANTUM_REMOTE is '$remote' after adding the token and flisk restart, expected true"
length="$(provider_field token_length)"
[ "$length" = "${#token}" ] || fail "the service sees a token of $length characters, expected ${#token}"
if grep -rq -- "$token" services/app/*/.autogenerated .flisk/.flisk-out 2>/dev/null; then fail "a generated file holds the token"; fi
echo "PASS after the token is added to .env and flisk restart, REMOTE=true and the service has the new token; no generated file holds it"
