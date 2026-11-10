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

e2e_cleanup() {
  local exit_code=$?
  echo "Cleaning up stack..."
  if [ -n "$up_pid" ]; then
    kill "$up_pid" >/dev/null 2>&1 || true
  fi
  (cd "$EXAMPLE_DIR" && node "$FLISK_BIN" down >/dev/null 2>&1 || true)
  if [ -f "$EXAMPLE_DIR/services/app/api/src/main.py.bak" ]; then
    mv "$EXAMPLE_DIR/services/app/api/src/main.py.bak" "$EXAMPLE_DIR/services/app/api/src/main.py"
  fi
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
      uv pip install -r requirements.txt
    else
      python3 -m venv .venv
      .venv/bin/pip install -r requirements.txt
    fi
  fi
  echo "Python dependencies verified."
}

T2_START_AND_TASKS() {
  log "T2: Starting Flisk stack and verifying task execution"
  cd "$EXAMPLE_DIR"

  # Start flisk up in background
  node "$FLISK_BIN" up > up.log 2>&1 &
  up_pid=$!

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
  local api_main="services/app/api/src/main.py"
  cp "$api_main" "$api_main.bak"

  # Append live reload test endpoint
  cat >> "$api_main" <<'PY'

@app.get("/test-live-reload")
def test_live_reload():
    return {"live_reload": "active", "timestamp": 123456789}
PY

  echo "Waiting for Uvicorn reload..."
  local reloaded=false
  for _ in $(seq 1 20); do
    if curl -s http://127.0.0.1:8000/test-live-reload | grep -q '"live_reload":"active"'; then
      reloaded=true
      break
    fi
    sleep 0.5
  done

  [ "$reloaded" = "true" ] || fail "Uvicorn did not reload the updated main.py"
  echo "PASS: Live reload detected and served /test-live-reload immediately."

  # Ensure Celery and Redis are still alive and task processing still works
  if [ -x ".venv/bin/python" ]; then
    .venv/bin/python "$SUITE_DIR/test_fastapi_celery_redis.py"
  else
    python3 "$SUITE_DIR/test_fastapi_celery_redis.py"
  fi
  echo "PASS: Celery and Redis remained fully operational across live reload."

  # Revert change
  mv "$api_main.bak" "$api_main"
}

T4_TEARDOWN() {
  log "T4: Tearing down stack with flisk down"
  cd "$EXAMPLE_DIR"
  node "$FLISK_BIN" down
  sleep 1

  # Verify Redis container is removed
  if docker ps -a --filter "name=flisk-fastapi-celery-redis-redis" --format '{{.Names}}' | grep -q "redis"; then
    fail "Redis container was not removed after flisk down"
  fi
  echo "PASS: Clean teardown verified."
}

e2e_main "${@:-all}"
