import os
import socket
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="api-backend")

# The frontend runs on its own *.localhost origin (app.<project>.localhost), so the browser needs CORS to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://([a-z0-9-]+\.)+localhost(:\d+)?$",
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
        return {"status": "error", "service": "api-backend", "database": database_error}
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
