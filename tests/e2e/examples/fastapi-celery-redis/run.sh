#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# E2E test for the FastAPI + Celery + Redis recipe under Flisk mixed runtime.
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init fastapi-celery-redis fastapi-celery-redis

REPO_ROOT="$(cd "$SUITE_DIR/../../../../" && pwd)"
EXAMPLE_DIR="$REPO_ROOT/examples/fastapi-celery-redis"
FLISK_BIN="${FLISK_BIN:-$REPO_ROOT/cli/bin/flisk.js}"

up_pid=""
live_reload_bak=""

restore_live_reload_main() {
  if [ -n "${live_reload_bak:-}" ] && [ -f "$live_reload_bak" ]; then
    local api_main="$EXAMPLE_DIR/services/app/api/src/main.py"
    if [ -f "$api_main" ]; then
      cp "$live_reload_bak" "$api_main" 2>/dev/null || true
    fi
    rm -f "$live_reload_bak"
    live_reload_bak=""
  fi
}

e2e_cleanup() {
  local exit_code=$?
  echo "Cleaning up stack..."
  restore_live_reload_main
  local pid="${up_pid:-}"
  if [ -z "$pid" ] && [ -f "$EXAMPLE_DIR/.flisk.pid" ]; then
    pid="$(cat "$EXAMPLE_DIR/.flisk.pid" 2>/dev/null || true)"
  fi
  if [ -n "$pid" ]; then
    kill "$pid" >/dev/null 2>&1 || true
  fi
  rm -f "$EXAMPLE_DIR/.flisk.pid"

  (cd "$EXAMPLE_DIR" && node "$FLISK_BIN" down >/dev/null 2>&1 || true)
  return "$exit_code"
}

e2e_diagnostics() {
  if [ -f "$EXAMPLE_DIR/up.log" ]; then
    echo "Tail of up.log:"
    tail -40 "$EXAMPLE_DIR/up.log" >&2
  fi
}

log() {
  echo -e "\n\033[1;34m===> $*\033[0m"
}

fail() {
  echo -e "\n\033[1;31mFAIL: $*\033[0m" >&2
  e2e_diagnostics
  exit 1
}

T1_PREREQS() {
  log "T1: Setting up Python environment in $EXAMPLE_DIR"
  cd "$EXAMPLE_DIR"
  if [ ! -d ".venv" ]; then
    if command -v uv >/dev/null 2>&1; then
      uv venv .venv
    else
      python3 -m venv .venv
    fi
  fi
  # Install requirements idempotently on every invocation to ensure complete environment
  if command -v uv >/dev/null 2>&1; then
    uv pip install -r requirements.txt
  else
    .venv/bin/pip install -r requirements.txt
  fi
  echo "Python dependencies verified."
}

T2_START_AND_TASKS() {
  log "T2: Starting Flisk stack and verifying task execution"
  cd "$EXAMPLE_DIR"

  # Start flisk up in background
  node "$FLISK_BIN" up > up.log 2>&1 &
  up_pid=$!
  echo "$up_pid" > "$EXAMPLE_DIR/.flisk.pid"

  echo "Waiting for stack to become healthy..."
  for _ in $(seq 1 60); do
    if curl -s http://127.0.0.1:8000/health | grep -q '"status":"ok"'; then
      break
    fi
    if ! kill -0 "$up_pid" 2>/dev/null; then
      fail "flisk up process exited unexpectedly"
    fi
    sleep 1
  done

  curl -s http://127.0.0.1:8000/health | grep -q '"status":"ok"' || fail "Health check failed after 60s"
  echo "FastAPI health check responded OK."

  # Verify Redis container is running
  docker ps --filter "name=flisk-fastapi-celery-redis-redis" --format '{{.Names}}' | grep -q "redis" || fail "Redis container not found"
  echo "Redis container running."

  # Run Python integration test
  if [ -x ".venv/bin/python" ]; then
    .venv/bin/python "$SUITE_DIR/test_fastapi_celery_redis.py"
  else
    python3 "$SUITE_DIR/test_fastapi_celery_redis.py"
  fi
}

T3_LIVE_RELOAD() {
  log "T3: Verifying live reload without container or worker disruption"
  cd "$EXAMPLE_DIR"

  # If stack is not running (e.g. standalone test invocation), start it
  if ! curl -s http://127.0.0.1:8000/health | grep -q '"status":"ok"'; then
    T2_START_AND_TASKS
  fi

  local api_main="services/app/api/src/main.py"
  local bak_file
  bak_file="$(mktemp "${TMPDIR:-/tmp}/flisk_main_bak_XXXXXX.py")"
  cp "$api_main" "$bak_file"
  live_reload_bak="$bak_file"

  # Ensure restoration on any exit, signal, or failure (including standalone runs)
  local previous_exit_trap
  previous_exit_trap="$(trap -p EXIT | sed -e "s/^trap -- '//" -e "s/' EXIT$//" || true)"
  if [ -n "$previous_exit_trap" ]; then
    trap 'restore_live_reload_main; '"$previous_exit_trap" EXIT
  else
    trap 'restore_live_reload_main' EXIT
  fi
  trap 'restore_live_reload_main; exit 1' INT TERM

  # 1. Verify endpoint does not exist initially (must return 404)
  local initial_code
  initial_code="$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/test-live-reload || true)"
  [ "$initial_code" = "404" ] || fail "Expected /test-live-reload to return 404 before modification, got $initial_code"
  echo "Confirmed /test-live-reload returns 404 prior to file modification."

  # 2. Append live reload test endpoint
  cat >> "$api_main" <<'PY'

@app.get("/test-live-reload")
def test_live_reload():
    """Temporary test endpoint for hot reload verification."""
    return {"live_reload": "active", "timestamp": 123456789}
PY

  # 3. Poll until Uvicorn reloads and serves the new route
  echo "Waiting for Uvicorn reload..."
  local reloaded=false
  for _ in $(seq 1 30); do
    if curl -s http://127.0.0.1:8000/test-live-reload | grep -q '"live_reload":"active"'; then
      reloaded=true
      break
    fi
    sleep 0.5
  done

  [ "$reloaded" = "true" ] || fail "Uvicorn did not reload the updated main.py"
  echo "PASS: Live reload detected and served /test-live-reload with HTTP 200."

  # 4. Ensure Celery and Redis are still alive and task processing still works
  if [ -x ".venv/bin/python" ]; then
    .venv/bin/python "$SUITE_DIR/test_fastapi_celery_redis.py"
  else
    python3 "$SUITE_DIR/test_fastapi_celery_redis.py"
  fi
  echo "PASS: Celery and Redis remained fully operational across live reload."

  # 5. Revert change and verify endpoint returns 404 again
  restore_live_reload_main
  local reverted=false
  for _ in $(seq 1 30); do
    local code
    code="$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/test-live-reload || true)"
    if [ "$code" = "404" ]; then
      reverted=true
      break
    fi
    sleep 0.5
  done
  [ "$reverted" = "true" ] || fail "Uvicorn did not revert the removed route"
  echo "PASS: Live reload successfully reverted /test-live-reload back to 404."

  # Restore previous trap once T3 finishes successfully
  if [ -n "$previous_exit_trap" ]; then
    trap "$previous_exit_trap" EXIT
  else
    trap - EXIT
  fi
  trap - INT TERM
}

T4_TEARDOWN() {
  log "T4: Tearing down stack with flisk down"
  cd "$EXAMPLE_DIR"
  node "$FLISK_BIN" down
  rm -f "$EXAMPLE_DIR/.flisk.pid"
  sleep 1

  # Verify Redis container is removed
  if docker ps -a --filter "name=flisk-fastapi-celery-redis-redis" --format '{{.Names}}' | grep -q "redis"; then
    fail "Redis container was not removed after flisk down"
  fi
  echo "PASS: Clean teardown verified."
}

e2e_main "${@:-all}"
