import os
from typing import Any, Dict, Optional
from celery import Celery
from celery.result import AsyncResult
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")

celery_app = Celery("tasks", broker=REDIS_URL, backend=REDIS_URL)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    result_expires=3600,
)

app = FastAPI(
    title="FastAPI + Celery + Redis Example",
    description="Flisk example running FastAPI and Celery worker locally, with Redis in Docker.",
    version="1.0.0",
)


class TaskPayload(BaseModel):
    x: int = Field(default=10, description="First integer operand")
    y: int = Field(default=20, description="Second integer operand")


class TaskResponse(BaseModel):
    task_id: str
    status: str


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    ready: bool
    result: Optional[Any] = None


@app.get("/")
def read_root() -> Dict[str, str]:
    """Root metadata endpoint describing service capabilities and endpoints."""
    return {
        "message": "FastAPI + Celery + Redis running under Flisk",
        "docs": "/docs",
        "health": "/health",
        "tasks_endpoint": "/tasks",
    }


@app.get("/health")
def read_health() -> Dict[str, str]:
    """Service health probe endpoint."""
    return {"status": "ok", "service": "api"}


@app.post("/tasks", response_model=TaskResponse, status_code=202)
def create_task(payload: TaskPayload) -> TaskResponse:
    """Enqueues an asynchronous compute task to Celery via Redis broker."""
    try:
        async_result = celery_app.send_task("tasks.compute", args=[payload.x, payload.y])
        return TaskResponse(task_id=async_result.id, status=async_result.status)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to enqueue task: {exc}") from exc


@app.get("/tasks/{task_id}", response_model=TaskStatusResponse)
def get_task_status(task_id: str) -> TaskStatusResponse:
    """Retrieves current execution status and result for an enqueued task."""
    async_result = AsyncResult(task_id, app=celery_app)
    result_val = None
    if async_result.ready():
        try:
            val = async_result.result
            if isinstance(val, Exception):
                result_val = {"error": type(val).__name__, "message": str(val)}
            else:
                result_val = val
        except Exception as exc:
            result_val = {"error": type(exc).__name__, "message": str(exc)}
    return TaskStatusResponse(
        task_id=task_id,
        status=async_result.status,
        ready=async_result.ready(),
        result=result_val,
    )
