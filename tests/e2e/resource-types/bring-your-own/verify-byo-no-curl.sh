#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Issue #3107: Verify that a bring-your-own image without curl fails `flisk up --wait`
# with a readable message, providing a before/after regression test for health check diagnostics (#3056).
#
# Usage: tests/e2e/resource-types/bring-your-own/verify-byo-no-curl.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/../../../.." && pwd)"
fixture="$root/tests/e2e/fixtures/byo-no-curl"
[ -d "$fixture" ] || { echo "no such fixture: $fixture" >&2; exit 2; }

pid="$$"
proj="nocurl$pid"
work="$(mktemp -d)/$proj"
mkdir -p "$work"
flisk() { command "${FLISK_BIN:-flisk}" "$@"; }
res="no-curl"

cleanup() {
  pkill -f "tilt up.*$proj" >/dev/null 2>&1 || true
  docker rm -f $(docker ps -aq --filter "name=$proj") >/dev/null 2>&1 || true
  docker network ls --format '{{.Name}}' | grep "^${proj}" | xargs -r docker network rm >/dev/null 2>&1 || true
  docker images --format '{{.Repository}}:{{.Tag}}' | grep -E "^${proj}_" | xargs -r docker rmi -f >/dev/null 2>&1 || true
  docker images --format '{{.Repository}}:{{.Tag}}' | grep -E "^${proj}-l[0-9]+" | xargs -r docker rmi -f >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

echo "Verifying busybox base image lacks curl..."
if docker run --rm busybox:1.37.0 which curl >/dev/null 2>&1; then
  echo "FAIL: busybox unexpectedly contains curl" >&2
  exit 1
fi

cd "$work"
git init -q .
flisk project --yes >/dev/null
http_port=$((30000 + RANDOM % 2000))
printf '\nFLISK_HTTP_PORT=%s\nFLISK_HTTPS_PORT=%s\nFLISK_POSTGRES_PORT=%s\n' \
  "$http_port" "$((32000 + RANDOM % 2000))" "$((34000 + RANDOM % 2000))" >> .env

mkdir -p "services/app/$res"
cp -R "$fixture/." "services/app/$res/"
# Set the resource name to match $res
node -e '
const fs = require("fs");
const file = "services/app/'"$res"'/service.json";
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
manifest.appName = "'"$res"'";
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
'

flisk config regenerate >/dev/null

echo "Starting flisk up app --wait (expecting failure due to missing curl)..."
set +e
flisk_out="$(flisk up app --wait --wait-timeout 25 2>&1)"
flisk_exit=$?
set -e

if [ "$flisk_exit" -eq 0 ]; then
  echo "FAIL: flisk up app --wait succeeded unexpectedly" >&2
  exit 1
fi

echo "flisk up exit code: $flisk_exit"
echo "Output:"
echo "$flisk_out"

if ! echo "$flisk_out" | grep -q "flisk up failed"; then
  echo "FAIL: output does not contain 'flisk up failed'" >&2
  exit 1
fi

if ! echo "$flisk_out" | grep -q "$res"; then
  echo "FAIL: output does not name the failing service '$res'" >&2
  exit 1
fi

cid="$(docker ps -aq --filter "name=${proj}.*${res}" | head -n 1)"
if [ -n "$cid" ]; then
  health_json="$(docker inspect "$cid" --format '{{json .State.Health}}' 2>/dev/null || true)"
  echo "Container health status: $health_json"
  if echo "$health_json" | grep -qi "curl"; then
    echo "Confirmed: container health probe recorded curl failure"
  fi
fi

echo "PASS BY12: bring-your-own image without curl fails --wait as expected"
