"""Flisk gives a bring-your-own service DATABASE_URL but does not create the database, so create it if missing."""
import os
import time
from urllib.parse import urlsplit, urlunsplit

import psycopg
from psycopg import sql

url = os.environ["DATABASE_URL"].split("?")[0]
parts = urlsplit(url)
db = parts.path.lstrip("/")
admin = urlunsplit(parts._replace(path="/postgres"))

for attempt in range(60):
    try:
        conn = psycopg.connect(admin, autocommit=True)
        break
    except psycopg.OperationalError:
        if attempt == 59:
            raise
        time.sleep(1)

with conn:
    exists = conn.execute("select 1 from pg_database where datname = %s", (db,)).fetchone()
    if not exists:
        # nosemgrep: python.sqlalchemy.security.sqlalchemy-execute-raw-query.sqlalchemy-execute-raw-query -- psycopg sql.Identifier quotes the database name
        conn.execute(sql.SQL("create database {}").format(sql.Identifier(db)))
