# FastAPI + Celery + Redis on Flisk

This recipe demonstrates running a modern asynchronous Python application stack with **Flisk's mixed runtime**:
- **FastAPI** (`api`): Runs natively as a local process with Uvicorn live reload.
- **Celery Worker** (`worker`): Runs natively as a local process, processing background tasks from the queue.
- **Redis** (`redis`): Runs in Docker via `redis:7-alpine`, managed automatically by Flisk without Tilt or Compose overhead.

Flisk manages all three components with one command: starting Redis in Docker, waiting for port `6379`, launching the Celery worker and FastAPI application in topological dependency order, streaming logs, and handling clean shutdown.

---

## Architecture Overview

```
                      +---------------------------------------+
                      |               Developer               |
                      +---------------------------------------+
                                  |                 |
                         curl / browser       file edits
                                  |                 |
                                  v                 v
+-------------------------------------------------------------------------+
| Local Machine                                                           |
|                                                                         |
|  [FastAPI Process] (port 8000) <------- Live reload via Uvicorn         |
|         |                                (no container restart)         |
|         | POST /tasks (enqueues task)                                   |
|         | GET /tasks/:id (reads result)                                 |
|         v                                                               |
|  [Redis Container] (127.0.0.1:6379) <---+ (broker & backend)            |
|         ^                               |                               |
|         |                               |                               |
|  [Celery Worker Process] ---------------+                               |
|         (consumes queue & executes jobs)                                |
|                                                                         |
+-------------------------------------------------------------------------+
```

---

## Prerequisites

1. **Docker**: Docker Desktop, OrbStack, or Colima running.
2. **Python 3.10+** (or `uv`).
3. **Flisk CLI** installed and built.

---

## Quickstart

### 1. Set Up Python Dependencies

From this example directory:

```bash
cd examples/fastapi-celery-redis

# Option A: using uv (fastest)
uv venv .venv
uv pip install -r requirements.txt

# Option B: using standard python3 venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Start the Stack

```bash
flisk up
```

Flisk will:
1. Detect `redis` as a container service and launch `docker run -d ... redis:7-alpine`.
2. Wait for Redis port `6379` to accept connections.
3. Launch the `worker` process (`src.tasks.celery_app`).
4. Launch the `api` process (`uvicorn main:app --reload`).
5. Confirm the stack is healthy once `http://127.0.0.1:8000/health` responds 200 OK.

---

## Interacting with the Stack

### Health Check

```bash
curl http://127.0.0.1:8000/health
# {"status":"ok","service":"api"}
```

### Enqueue a Background Task

```bash
curl -X POST http://127.0.0.1:8000/tasks \
  -H "Content-Type: application/json" \
  -d '{"x": 12, "y": 8}'
```

Response:
```json
{"task_id":"b7c3d1f4-3456-42bc-a4ef-4b47c0b0a312","status":"PENDING"}
```

### Poll Task Status & Result

```bash
curl http://127.0.0.1:8000/tasks/b7c3d1f4-3456-42bc-a4ef-4b47c0b0a312
```

Response (once completed):
```json
{
  "task_id": "b7c3d1f4-3456-42bc-a4ef-4b47c0b0a312",
  "status": "SUCCESS",
  "ready": true,
  "result": {
    "x": 12,
    "y": 8,
    "sum": 20,
    "product": 96,
    "status": "completed"
  }
}
```

---

## Live Reload Behavior

Edit `services/app/api/src/main.py` while `flisk up` is running.
Uvicorn automatically detects changes inside `src/` and performs an instant in-process reload:
- **FastAPI** reloads within milliseconds.
- **Celery worker** and **Redis** remain unaffected and connected.
- No Docker build or container recreation is triggered.

---

## Teardown

Press `Ctrl+C` in the terminal running `flisk up`, or run from another terminal:

```bash
flisk down
```

Flisk terminates local processes gracefully and removes the Redis container.

