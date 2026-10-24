# A real `django-admin startproject` app (default SQLite, no external database): the generator runs at build time.
FROM python:3.12-slim@sha256:05cda9777409a9c3ffddd94a4c476b79f0769a0b4857f0c7ed9226b6800b0d6f
ENV PYTHONUNBUFFERED=1
WORKDIR /work
COPY requirements.txt ./
RUN pip install --no-cache-dir --require-hashes -r requirements.txt \
 && django-admin startproject app . \
 && python manage.py migrate --noinput
RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --no-create-home app && chown -R app:app .
USER app
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD python -c "import os,socket; socket.create_connection(('127.0.0.1', int(os.environ.get('PORT','8000'))), 3)" || exit 1
# runserver must listen beyond loopback (0.0.0.0) and on the port Flisk assigns.
CMD ["sh", "-c", "python manage.py runserver 0.0.0.0:${PORT:-8000} --noreload"]
