#!/bin/sh
# Map Flisk's environment onto what the generated project expects, create the database, migrate, then serve.
set -eu
# Flisk's DATABASE_URL ends in a Prisma-style ?schema=public that PostgreSQL drivers do not accept as a parameter, so strip it.
export DATABASE_URL="${DATABASE_URL%%\?*}"
export DJANGO_SETTINGS_MODULE=config.settings.tdk
export DJANGO_SECRET_KEY="${DJANGO_SECRET_KEY:-$(python -c 'import secrets; print(secrets.token_urlsafe(32))')}"

python /ensure_db.py
python manage.py migrate --noinput
exec python manage.py runserver "0.0.0.0:${PORT:-8000}" --noreload
