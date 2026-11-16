FROM python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --require-hashes -r requirements.txt
COPY app.py ./
RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --no-create-home app && chown -R app:app .
USER app
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD python -c "import os,socket; socket.create_connection(('127.0.0.1', int(os.environ.get('PORT','3000'))), 3)" || exit 1
# Shell form so $PORT is expanded at start-up.
CMD uvicorn app:app --host 0.0.0.0 --port ${PORT:-3000}
