#!/bin/sh
# Flisk gives a bring-your-own job DATABASE_URL but does not create the database, so create it if missing.
set -eu
url="${DATABASE_URL%%\?*}"   # drop the Prisma-style ?schema=public that Postgres refuses as a parameter
db="${url##*/}"
server="${url%/*}"
# Wait for Postgres, but give up with the last error so a wrong URL fails the job instead of hanging it.
tries=0
until err="$(psql "$server/postgres" -tAc "select 1" 2>&1 >/dev/null)"; do
  tries=$((tries + 1))
  if [ "$tries" -ge 60 ]; then
    echo "Postgres did not accept connections after 60 attempts: $err" >&2
    exit 1
  fi
  sleep 1
done
psql "$server/postgres" -tAc "select 1 from pg_database where datname = '$db'" | grep -q 1 \
  || psql "$server/postgres" -c "create database \"$db\""
exec ptah migrations up --db-url "$url" --migrations-dir /migrations
