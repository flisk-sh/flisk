#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# Build one examples/byo/<name> image, run it with PORT=4000 and check it answers
# HTTP 200 on its health path. Publishing the port through Docker's proxy only
# works when the server is bound beyond the container's loopback, so a pass also
# checks the 0.0.0.0 requirement from docs/byo.md.
#
# Usage: tests/e2e/resource-types/bring-your-own/verify-byo-example.sh <name> [health-path]   (default /health)
# VERIFY_WAIT_SECONDS (default 20) is how long to wait for a slow-starting app.
set -euo pipefail

name="${1:?usage: verify-byo-example.sh <name> [health-path]}"
health="${2:-/health}"
dir="$(cd "$(dirname "$0")/../../../.." && pwd)/examples/byo/$name"
image="tdk-byo-verify-$name"
container="$image-$$"

[ -d "$dir" ] || { echo "no such example: $dir" >&2; exit 2; }
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; docker rmi -f "$image" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker build -q -t "$image" "$dir" >/dev/null
docker run -d --rm --name "$container" -e PORT=4000 -p 127.0.0.1::4000 "$image" >/dev/null
host_port="$(docker port "$container" 4000/tcp | head -1 | sed 's/.*://')"

status=000
for _ in $(seq 1 $(( ${VERIFY_WAIT_SECONDS:-20} * 2 ))); do
  status="$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:$host_port$health" || true)"
  [ "$status" = "200" ] && break
  docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null | grep -q true || break
  sleep 0.5
done

if [ "$status" = "200" ]; then
  echo "PASS $name: GET $health -> 200 ($(curl -s -m 2 "http://127.0.0.1:$host_port$health" | head -c 80))"
else
  echo "FAIL $name: GET $health -> $status" >&2
  docker logs "$container" 2>&1 | tail -15 >&2 || true
  exit 1
fi
