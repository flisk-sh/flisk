#!/bin/sh
# One-shot migration: creates the notes database and table. Idempotent.
set -e
echo "$(date +%s) boot migrate" >> ../events.log
P="psql -h 127.0.0.1 -p $DB_PORT -U app -v ON_ERROR_STOP=1 -q"
$P postgres -tc "select 1 from pg_database where datname='notes'" | grep -q 1 || $P postgres -c "create database notes"
$P notes -c "create table if not exists notes (id serial primary key, text text not null, created_at timestamptz default now())"
echo "migration done"
