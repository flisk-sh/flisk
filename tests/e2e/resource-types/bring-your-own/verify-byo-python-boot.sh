#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
readonly FIXTURE_DIR="${REPO_ROOT}/tests/e2e/fixtures/byo-python-health"
readonly SCHEMA="${REPO_ROOT}/engine/schemas/service-schema.json"
readonly PROJECT_DIR="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/tdk-byo-python-boot"
readonly RESOURCE_DIR="${PROJECT_DIR}/services/shop/legacy"
readonly CLI="${TDK_BIN:-tdk}"
readonly PROBE_SECONDS=180
readonly HTTP_PORT="${TDK_HTTP_PORT:-8080}"

cleanup() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    echo "::group::legacy container logs (last 80 lines)"
    for container in $(docker ps -a --format '{{.Names}}' | grep -i legacy || true); do
      docker logs --tail 80 "$container" 2>&1 || true
    done
    echo "::endgroup::"
  fi
  if [[ -d "$PROJECT_DIR" ]]; then
    (cd "$PROJECT_DIR" && "$CLI" down) || true
  fi
  exit "$status"
}
trap cleanup EXIT

if ! command -v "$CLI" >/dev/null 2>&1; then
  echo "flisk CLI not found: $CLI" >&2
  exit 1
fi
if ! command -v ajv >/dev/null 2>&1; then
  echo "Ajv CLI is required to validate service.json against the repository schema" >&2
  exit 1
fi
command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }

rm -rf "$PROJECT_DIR"
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# This job has Docker, Tilt, and the runner's 5432 conflict cleared, so use
# the real initializer to generate .tdk/.tdk-out before starting the stack.
"$CLI" project --yes

mkdir -p "$RESOURCE_DIR"
cp -a "$FIXTURE_DIR/." "$RESOURCE_DIR/"
"$CLI" resource legacy --type byo --stack shop --dockerfile ./Dockerfile --port 4500 --yes

test -f services/shop/legacy/service.json
test -f services/shop/legacy/AGENTS.md
test ! -d services/shop/legacy/src
test ! -f services/shop/legacy/package.json
test ! -f services/shop/legacy/tsconfig.json
test ! -f services/shop/legacy/health.conf
cmp "$FIXTURE_DIR/Dockerfile" services/shop/legacy/Dockerfile
jq -e '.appType == "bring-your-own" and .stack == "shop" and .port == 4500 and .dockerfile == "./Dockerfile"' \
  services/shop/legacy/service.json >/dev/null
ajv validate --spec=draft7 --strict=false -s "$SCHEMA" -d services/shop/legacy/service.json
cmp "$FIXTURE_DIR/app.py" services/shop/legacy/app.py

"$CLI" up shop --dry-run | tee up-dry-run.txt
grep -Fq -- "- legacy" up-dry-run.txt

"$CLI" up shop > up.log 2>&1 &
up_pid=$!
started_at=$(date +%s)
deadline=$((started_at + PROBE_SECONDS))

probe_url() {
  local url="$1" code body remaining max_time
  remaining=$((deadline - $(date +%s)))
  (( remaining > 0 )) || return 1
  max_time=$((remaining < 5 ? remaining : 5))
  body=$(mktemp)
  code=$(curl --silent --show-error --max-time "$max_time" -o "$body" -w '%{http_code}' "$url" 2>/dev/null || true)
  if [[ "$code" == 200 ]] && [[ "$(cat "$body")" == "ok" ]]; then
    rm -f "$body"
    return 0
  fi
  if [[ -n "$code" && "$code" != 000 ]]; then
    printf 'Probe miss: %s returned HTTP %s with body: ' "$url" "$code"
    head -c 200 "$body"
    printf '\n'
  fi
  rm -f "$body"
  return 1
}

while :; do
  now=$(date +%s)
  (( now <= deadline )) || break
  candidates=()
  # Prefer URLs Flisk itself reports for the legacy service.
  remaining=$((deadline - $(date +%s)))
  if (( remaining > 0 )); then
    networks_output=$(timeout "$remaining" "$CLI" networks --raw 2>/dev/null || true)
    while IFS= read -r url; do
      if [[ "$url" == *legacy* ]]; then
        [[ "$url" == */health ]] || url="${url%/}/health"
        candidates+=("$url")
      fi
    done < <(printf '%s' "$networks_output" | grep -Eo 'https?://[^"[:space:]]+' || true)
  fi
  if (( ${#candidates[@]} == 0 )); then
    remaining=$((deadline - $(date +%s)))
    if (( remaining > 0 )); then
      networks_output=$(timeout "$remaining" "$CLI" networks --json 2>/dev/null || true)
      while IFS= read -r url; do
        if [[ "$url" == *legacy* ]]; then
          [[ "$url" == */health ]] || url="${url%/}/health"
          candidates+=("$url")
        fi
      done < <(printf '%s' "$networks_output" | grep -Eo 'https?://[^"[:space:]]+' || true)
    fi
  fi

  # BYO services use the backend project route (`/api/<resource-name>`),
  # which strips that prefix before forwarding to the container.
  candidates+=(
    "http://api.tdk-byo-python-boot.localhost:${HTTP_PORT}/api/legacy/health"
    "http://app.tdk-byo-python-boot.localhost:${HTTP_PORT}/legacy/health"
    "http://127.0.0.1:${HTTP_PORT}/api/legacy/health"
  )
  for url in "${candidates[@]}"; do
    (( $(date +%s) <= deadline )) || break
    if probe_url "$url"; then
      echo "Health check passed: $url returned HTTP 200 and body ok"
      exit 0
    fi
  done

  if ! kill -0 "$up_pid" 2>/dev/null; then
    wait "$up_pid" || { echo "flisk up shop exited before health became ready"; tail -100 up.log; exit 1; }
  fi
  now=$(date +%s)
  elapsed=$(( now - started_at ))
  echo "Waiting for legacy /health ($elapsed/${PROBE_SECONDS}s)"
  remaining=$((deadline - now))
  if (( remaining <= 0 )); then
    break
  elif (( remaining > 5 )); then
    sleep 5
  else
    sleep "$remaining"
  fi
done

echo "No legacy health URL returned HTTP 200 with body ok within ${PROBE_SECONDS}s"
tail -100 up.log || true
exit 1
