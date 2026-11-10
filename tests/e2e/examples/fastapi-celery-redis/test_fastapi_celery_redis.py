#!/usr/bin/env python3
"""Integration tests for the FastAPI + Celery + Redis Flisk example."""

import os
import sys
import time
import urllib.request
import json
from typing import Any, Dict

BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8000")


def http_get(path: str) -> Dict[str, Any]:
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_post(path: str, data: Dict[str, Any]) -> Dict[str, Any]:
    url = f"{BASE_URL}{path}"
    payload = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def test_health():
    data = http_get("/health")
    assert data.get("status") == "ok", f"Expected ok status, got: {data}"
    assert data.get("service") == "api", f"Expected service api, got: {data}"
    print("PASS: /health endpoint returned expected response")


def test_root():
    data = http_get("/")
    assert "message" in data, f"Expected message in root response: {data}"
    assert data.get("health") == "/health"
    print("PASS: / endpoint returned expected response")


def test_task_queue_execution():
    # 1. Enqueue task
    x, y = 14, 3
    post_res = http_post("/tasks", {"x": x, "y": y})
    assert "task_id" in post_res, f"No task_id in response: {post_res}"
    task_id = post_res["task_id"]
    print(f"Task enqueued: {task_id}")

    # 2. Poll for completion
    deadline = time.time() + 30
    completed = False
    task_data = {}
    while time.time() < deadline:
        task_data = http_get(f"/tasks/{task_id}")
        if task_data.get("ready") is True:
            completed = True
            break
        time.sleep(0.5)

    assert completed, f"Task {task_id} did not complete within deadline: {task_data}"
    assert task_data.get("status") == "SUCCESS", f"Task status not SUCCESS: {task_data}"
    result = task_data.get("result", {})
    assert result.get("x") == x
    assert result.get("y") == y
    assert result.get("sum") == x + y
    assert result.get("product") == x * y
    assert result.get("status") == "completed"
    print(f"PASS: Celery executed task {task_id} with verified result: {result}")


if __name__ == "__main__":
    try:
        test_health()
        test_root()
        test_task_queue_execution()
        print("ALL TESTS PASSED")
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        sys.exit(1)

