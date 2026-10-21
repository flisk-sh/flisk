#!/bin/sh
# Flisk gives a bring-your-own job DATABASE_URL but does not create the database, so create it if missing.
set -eu
url="${DATABASE_URL%%\?*}"   # drop the Prisma-style ?schema=public that other drivers reject
db="${url##*/}"
server="${url%/*}"
export PGSSLMODE=disable     # Flisk's Postgres has SSL off
until psql "$server/postgres" -tAc "select 1" >/dev/null 2>&1; do sleep 1; done
psql "$server/postgres" -tAc "select 1 from pg_database where datname = '$db'" | grep -q 1 \
  || psql "$server/postgres" -c "create database \"$db\""
exec atlas schema apply --url "$url?sslmode=disable" --to file:///schema.hcl --auto-approve
