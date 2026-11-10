# FastAPI + Celery + Redis Recipe

A real-world recipe for running an asynchronous Python service stack under Flisk:
- **FastAPI** (`api`): Runs natively as a local process with Uvicorn live reload.
- **Celery Worker** (`worker`): Runs natively as a local process consuming background tasks.
- **Redis** (`redis`): Runs in Docker from the official `redis:7-alpine` image without custom Dockerfiles.

This recipe demonstrates Flisk's **mixed runtime**, where compute services run as lightweight host processes while databases and queues run in Docker containers published to localhost.

---

## Why This Pattern?

Full-container workflows often introduce friction for Python development:
1. **Slow live-reload**: File-sync into containers can miss events or trigger costly rebuilds.
2. **Debugger access**: Running FastAPI and Celery directly on the host gives instant access to breakpoints (`ipdb`, VS Code debuggers, cProfile).
3. **Zero container overhead for app code**: Only infrastructure (Redis, Postgres) runs in Docker; application processes start in sub-second times.
4. **Isolated infrastructure**: Redis requires no local installation or systemd service management; `flisk down` cleans it up automatically.

---

## Architecture and Contracts

```
[ Developer ] ---( HTTP / REST )---> [ FastAPI @ :8000 ]
                                            |
                                  (Enqueue / Read Status)
                                            v
[ Celery Worker ] <---( Redis Broker/Backend @ :6379 )
```

### 1. Redis Service (`services/app/redis/service.json`)
```json
{
  "$schema": "https://flisk.sh/schema.service.json",
  "schemaVersion": 1,
  "appName": "redis",
  "appType": "bring-your-own",
  "image": "redis:7-alpine",
  "port": 6379,
  "exposeViaProxy": false
}
```
Flisk runs `docker run --name flisk-<project>-redis -p 127.0.0.1:6379:6379 ...` and waits for port 6379 to accept TCP connections before starting dependent services.

### 2. Celery Worker Service (`services/app/worker/service.json`)
```json
{
  "$schema": "https://flisk.sh/schema.service.json",
  "schemaVersion": 1,
  "appName": "worker",
  "appType": "worker",
  "command": "sh -c 'if [ -n \"$VIRTUAL_ENV\" ] && [ -x \"$VIRTUAL_ENV/bin/celery\" ]; then exec \"$VIRTUAL_ENV/bin/celery\" -A src.tasks.celery_app worker --loglevel=info --pool=solo; elif [ -x ../../../.venv/bin/celery ]; then exec ../../../.venv/bin/celery -A src.tasks.celery_app worker --loglevel=info --pool=solo; elif [ -x .venv/bin/celery ]; then exec .venv/bin/celery -A src.tasks.celery_app worker --loglevel=info --pool=solo; elif command -v celery >/dev/null 2>&1; then exec celery -A src.tasks.celery_app worker --loglevel=info --pool=solo; else exec python3 -m celery -A src.tasks.celery_app worker --loglevel=info --pool=solo; fi'",
  "dependsOn": ["redis"],
  "env": {
    "REDIS_URL": "redis://127.0.0.1:6379/0"
  }
}
```
Flisk marks the worker ready as soon as its process stays alive through the startup grace period, since background workers do not bind HTTP ports.

### 3. FastAPI Service (`services/app/api/service.json`)
```json
{
  "$schema": "https://flisk.sh/schema.service.json",
  "schemaVersion": 1,
  "appName": "api",
  "appType": "backend",
  "command": "sh -c 'if [ -n \"$VIRTUAL_ENV\" ] && [ -x \"$VIRTUAL_ENV/bin/uvicorn\" ]; then exec \"$VIRTUAL_ENV/bin/uvicorn\" main:app --app-dir src --host 0.0.0.0 --port ${PORT:-8000} --reload --reload-dir src; elif [ -x ../../../.venv/bin/uvicorn ]; then exec ../../../.venv/bin/uvicorn main:app --app-dir src --host 0.0.0.0 --port ${PORT:-8000} --reload --reload-dir src; elif [ -x .venv/bin/uvicorn ]; then exec .venv/bin/uvicorn main:app --app-dir src --host 0.0.0.0 --port ${PORT:-8000} --reload --reload-dir src; elif command -v uvicorn >/dev/null 2>&1; then exec uvicorn main:app --app-dir src --host 0.0.0.0 --port ${PORT:-8000} --reload --reload-dir src; else exec python3 -m uvicorn main:app --app-dir src --host 0.0.0.0 --port ${PORT:-8000} --reload --reload-dir src; fi'",
  "port": 8000,
  "healthCheckPath": "/health",
  "dependsOn": ["redis"],
  "env": {
    "REDIS_URL": "redis://127.0.0.1:6379/0"
  }
}
```
Flisk probes `http://127.0.0.1:8000/health` to confirm the API is ready.

---

## Asynchronous Task Workflow

1. **Client sends task request**:
   ```bash
   curl -X POST http://127.0.0.1:8000/tasks \
     -H "Content-Type: application/json" \
     -d '{"x": 15, "y": 30}'
   ```
   FastAPI enqueues the task in Redis via `celery_app.send_task("tasks.compute", args=[15, 30])` and returns HTTP 202 with `task_id`.

2. **Celery Worker processes task**:
   The worker picks up the job from the Redis broker, runs the computation asynchronously, and records the result in the Redis result backend.

3. **Client polls status**:
   ```bash
   curl http://127.0.0.1:8000/tasks/<task_id>
   ```
   FastAPI inspects `AsyncResult(task_id)` and returns the computed result:
   ```json
   {
     "task_id": "...",
     "status": "SUCCESS",
     "ready": true,
     "result": { "x": 15, "y": 30, "sum": 45, "product": 450, "status": "completed" }
   }
   ```

---

## Live Reload Verification

Uvicorn's `--reload --reload-dir src` flag monitors the API source directory:
- Editing `services/app/api/src/main.py` causes Uvicorn to automatically reload its worker process.
- The parent process PID remains alive, so Flisk's process supervisor detects no disruption.
- Celery worker and Redis remain active; ongoing jobs and task state are completely preserved.

---

## Automated Testing

An automated test suite in `tests/e2e/examples/fastapi-celery-redis/` validates:
1. Topological start order (`redis` -> `worker` -> `api`).
2. HTTP health probe at `/health`.
3. Task enqueueing via `POST /tasks`.
4. Asynchronous task execution and completion in Celery via `GET /tasks/:id`.
5. Uvicorn live reload upon updating `main.py`.
6. Clean teardown with `flisk down`.

