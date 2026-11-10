import os
import time
from typing import Any, Dict
from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")

celery_app = Celery("tasks", broker=REDIS_URL, backend=REDIS_URL)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    result_expires=3600,
)


@celery_app.task(name="tasks.compute")
def compute(x: int, y: int) -> Dict[str, Any]:
    """Sample asynchronous compute task."""
    time.sleep(0.5)
    return {
        "x": x,
        "y": y,
        "sum": x + y,
        "product": x * y,
        "status": "completed",
    }

