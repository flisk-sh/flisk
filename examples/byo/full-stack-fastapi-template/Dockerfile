# The real fastapi/full-stack-fastapi-template backend, cloned at build time and run with Flisk's DATABASE_URL.
FROM python:3.14@sha256:1eb6b7d4b76454b1de8317863ac3213b678c337b27e604a4e3fb70bddbb2bad7
ENV PYTHONUNBUFFERED=1
COPY --from=ghcr.io/astral-sh/uv:0.9.26 /uv /uvx /bin/
ENV UV_LINK_MODE=copy
RUN git clone --depth 1 https://github.com/fastapi/full-stack-fastapi-template /src \
 && git -C /src rev-parse HEAD > /src/COMMIT
WORKDIR /src
RUN uv sync --frozen --package app
ENV PATH="/src/.venv/bin:$PATH"
# The template mounts a built frontend at import time. This example runs the API only, so give it an empty one.
RUN mkdir -p backend/app/frontend && echo '<!doctype html><title>api only</title>' > backend/app/frontend/index.html
COPY ensure_db.py entrypoint.sh /
WORKDIR /src/backend
RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --no-create-home app
RUN chown -R app:app /src
USER app
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD python -c "import os,socket; socket.create_connection(('127.0.0.1', int(os.environ.get('PORT','8000'))), 3)"
CMD ["sh", "/entrypoint.sh"]
