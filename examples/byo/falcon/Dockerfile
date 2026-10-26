# A minimal Falcon app (Falcon has no project generator, so the app is the files next to this Dockerfile).
FROM python:3.12-slim@sha256:05cda9777409a9c3ffddd94a4c476b79f0769a0b4857f0c7ed9226b6800b0d6f
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --require-hashes -r requirements.txt
COPY app.py ./
RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --no-create-home app && chown -R app:app .
USER app
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD python -c "import os,socket; socket.create_connection(('127.0.0.1', int(os.environ.get('PORT','8000'))), 3)" || exit 1
# uvicorn must listen beyond loopback (--host) and on the port Flisk assigns.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
