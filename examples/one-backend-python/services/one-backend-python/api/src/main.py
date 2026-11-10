import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="api-backend")

# The frontend runs on its own *.localhost origin (app.<project>.localhost), so the browser needs CORS to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://([a-z0-9-]+\.)+localhost(:\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "api-backend"}


@app.get("/")
def root() -> dict[str, object]:
    return {"service": "api-backend", "version": "1.0.0", "endpoints": ["/health"]}


def read_port() -> int:
    try:
        port = int(os.environ.get("PORT", "3000"))
    except ValueError:
        return 3000
    return port if 1 <= port <= 65535 else 3000


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=read_port())
