// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import {
  LOCAL_FRONTEND_CORS_REASON,
  LOCAL_FRONTEND_ORIGIN_PATTERN,
} from "../utils/generated-cors.js";
import type { BackendLanguageProvider } from "./types.js";

// ${PORT:-4000} is shell parameter expansion. Split so Biome does not read it
// as a JS template placeholder and the shell still receives the literal form.
export const PYTHON_DEV_COMMAND =
  "uvicorn main:app --app-dir src --host 0.0.0.0 --port $" +
  "{PORT:-4000} --reload --reload-dir src";

export const pythonBackendProvider: BackendLanguageProvider = {
  id: "python",
  label: "Python 3.12 + FastAPI",
  devCommand: PYTHON_DEV_COMMAND,
  watch: ["src/**/*"],
  installHint: 'pip install -e ".[dev]"   # optional: Docker builds the image for you',
  createFiles(name) {
    return [
      {
        filename: "pyproject.toml",
        content: `[project]
name = "${name}"
version = "0.0.1"
requires-python = ">=3.12"
dependencies = [
  "fastapi==0.115.6",
  "uvicorn[standard]==0.34.0",
]

[project.optional-dependencies]
dev = [
  "pytest==9.0.3",
  "httpx==0.28.1",
]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

# Only the dependencies are installed into the image; the source is synced for live reload.
[tool.setuptools]
py-modules = []

[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
`,
        description: "Generating pyproject.toml",
        emoji: "📦",
      },
      {
        filename: "src/main.py",
        content: `import os
import socket
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="${name}")

# ${LOCAL_FRONTEND_CORS_REASON}
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"${LOCAL_FRONTEND_ORIGIN_PATTERN}",
    allow_methods=["*"],
    allow_headers=["*"],
)


def check_database() -> str | None:
    """None when the database answers, or when this service has none; otherwise the reason it does not.

    Flisk sets DATABASE_URL when service.json lists the database in dependsOn. With a Postgres driver installed (psycopg or
    psycopg2) this runs SELECT 1, so a wrong password fails here; without one it only checks that the port accepts connections.
    """
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        return None
    parts = urlsplit(url)
    # Prisma's ?schema= is not a libpq parameter, and libpq refuses a URL that carries it.
    query = urlencode([(key, value) for key, value in parse_qsl(parts.query) if key != "schema"])
    url = urlunsplit(parts._replace(query=query))
    try:
        try:
            from psycopg import connect
        except ImportError:
            try:
                from psycopg2 import connect
            except ImportError:
                connect = None
        if connect is None:
            with socket.create_connection((parts.hostname or "localhost", parts.port or 5432), timeout=2):
                return None
        connection = connect(url, connect_timeout=2)
        try:
            connection.cursor().execute("SELECT 1")
        finally:
            connection.close()
    except Exception as error:  # any failure means "not ready"; the reason goes into the response
        return f"database is not reachable: {error}".strip()
    return None


@app.get("/health")
def health(response: Response) -> dict[str, str]:
    # Ready means the server and its database are both up, so services that wait for this one start only then.
    database_error = check_database()
    if database_error:
        response.status_code = 503
        return {"status": "error", "service": "${name}", "database": database_error}
    return {"status": "ok", "service": "${name}"}


@app.get("/")
def root() -> dict[str, object]:
    return {"service": "${name}", "version": "1.0.0", "endpoints": ["/health"]}


def read_port() -> int:
    try:
        port = int(os.environ.get("PORT", "3000"))
    except ValueError:
        return 3000
    return port if 1 <= port <= 65535 else 3000


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=read_port())
`,
        description: "Generating backend source",
        emoji: "💻",
      },
      {
        filename: "tests/test_health.py",
        content: `from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "${name}"}


def test_health_reports_an_unreachable_database(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:secret@127.0.0.1:1/app?schema=public")
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json()["status"] == "error"
    assert "database is not reachable" in response.json()["database"]


def test_root() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"service": "${name}", "version": "1.0.0", "endpoints": ["/health"]}
`,
        description: "Generating test file",
        emoji: "🧪",
      },
    ];
  },
};
