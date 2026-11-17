#!/bin/sh
# Real PostgreSQL, foreground, on $PORT. The data dir is created by prep (initdb) so it survives restarts.
set -e
echo "$(date +%s) boot db" >> ../events.log
D="${PGDATA_DIR:-$PWD/data}"
exec postgres -D "$D" -p "$PORT" -c listen_addresses=127.0.0.1 -c unix_socket_directories=''
