#!/bin/sh
# Map Flisk's environment onto what the template's settings expect, create the database, migrate, then serve.
set -eu
# The template wants a plain postgresql:// URL; Flisk's ends in a Prisma-style ?schema=public that libpq rejects.
export DATABASE_URL="${DATABASE_URL%%\?*}"
export PROJECT_NAME="${PROJECT_NAME:-full-stack-fastapi-template}"
export SECRET_KEY="${SECRET_KEY:-$(python -c 'import secrets; print(secrets.token_urlsafe(32))')}"
export FIRST_SUPERUSER="${FIRST_SUPERUSER:-admin@example.com}"
export FIRST_SUPERUSER_PASSWORD="${FIRST_SUPERUSER_PASSWORD:-$(python -c 'import secrets; print(secrets.token_urlsafe(16))')}"

python /ensure_db.py
bash scripts/prestart.sh                       # alembic upgrade head, then the initial superuser
exec fastapi run --host 0.0.0.0 --port "${PORT:-8000}" app/main.py
