# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
DB Readiness Shell Fragment

Generates the shell script block that:
  1. Parses DB_HOST / DB_PORT from DATABASE_URL when the separate vars are absent
  2. Loops with `nc` until PostgreSQL accepts connections (120 s timeout)

Returns a plain string that is embedded verbatim inside migrate.sh.
"""

load('../../../../tilt/common/utils_debug.star', 'DEBUG_MODE')
load(
    './constants.star',
    'DB_URL_HOSTPORT_NO_AUTH_SED',
    'DB_URL_HOSTPORT_WITH_AUTH_SED',
    'DEFAULT_DB_PORT',
    'DEFAULT_DB_WAIT_TIMEOUT_SECS',
)


def _host_port_parse_block():
    """
    Extract DB_HOST_VAL / DB_PORT_VAL from DATABASE_URL when the individual
    DB_HOST / DB_PORT env vars are not available.

    Handles both:
      postgresql://user:pass@host:port/db   (with auth)
      postgresql://host:port/db             (without auth)
    """
    return (
        "# Extract host and port for the readiness probe\n"
        + "DB_HOST_VAL=\"$DB_HOST\"\n"
        + "DB_PORT_VAL=\"$DB_PORT\"\n"
        + "if [ -z \"$DB_HOST_VAL\" ]; then\n"
        + "  HOSTPORT=$(printf '%s\\n' \"$DATABASE_URL\" | "
        + DB_URL_HOSTPORT_WITH_AUTH_SED + " | head -n1)\n"
        + "  if [ -z \"$HOSTPORT\" ]; then\n"
        + "    HOSTPORT=$(printf '%s\\n' \"$DATABASE_URL\" | "
        + DB_URL_HOSTPORT_NO_AUTH_SED + " | head -n1)\n"
        + "  fi\n"
        + "  if printf '%s\\n' \"$HOSTPORT\" | grep -q '^\\['; then\n"
        + "    DB_HOST_VAL=$(printf '%s\\n' \"$HOSTPORT\" | sed -n 's/^\\[\\([^]]*\\)\\]\\(:[0-9][0-9]*\\)\\?$/\\1/p' || true)\n"
        + "    DB_PORT_VAL=$(printf '%s\\n' \"$HOSTPORT\" | sed -n 's/^\\[[^]]*\\]:\\([0-9][0-9]*\\)$/\\1/p' || true)\n"
        + "  else\n"
        + "    DB_HOST_VAL=$(printf '%s\\n' \"$HOSTPORT\" | awk -F: '{print $1}' || true)\n"
        + "    DB_PORT_VAL=$(printf '%s\\n' \"$HOSTPORT\" | awk -F: 'NF>1{print $NF}' || true)\n"
        + "  fi\n"
        + "fi\n"
        + "DB_PORT_VAL=\"${DB_PORT_VAL:-" + DEFAULT_DB_PORT + "}\"\n"
        + "if [ -z \"$DB_HOST_VAL\" ]; then\n"
        + "  echo \"\\u274c ERROR: Unable to parse DB host from DATABASE_URL\"\n"
        + "  exit 1\n"
        + "fi\n"
    )


def _wait_loop_block(log_wait, log_ready, timeout_secs = DEFAULT_DB_WAIT_TIMEOUT_SECS):
    """
    nc-based polling loop.  Retries every second up to `timeout_secs`.
    """
    return (
        log_wait
        + "i=0\n"
        + "while ! nc -z \"${DB_HOST_VAL}\" \"${DB_PORT_VAL}\"; do\n"
        + "  i=$((i+1))\n"
        + "  if [ $i -gt " + str(timeout_secs) + " ]; then\n"
        + "    echo \"\\u274c Timeout waiting for DB at ${DB_HOST_VAL}:${DB_PORT_VAL}\"\n"
        + "    exit 1\n"
        + "  fi\n"
        + "  sleep 1\n"
        + "done\n"
        + log_ready
    )


def db_readiness_script(timeout_secs = DEFAULT_DB_WAIT_TIMEOUT_SECS):
    """
    Return the complete shell fragment that waits for PostgreSQL to accept
    connections before proceeding to migration.

    Args:
        timeout_secs: Seconds to wait before aborting (default: 120)
    """
    if DEBUG_MODE:
        log_wait  = "echo \"\\u23f3 Waiting for PostgreSQL at ${DB_HOST_VAL}:${DB_PORT_VAL}...\"\n"
        log_ready = "echo \"\\u2705 PostgreSQL is ready!\"\n"
    else:
        log_wait = ""
        log_ready = ""

    return (
        _host_port_parse_block()
        + _wait_loop_block(log_wait, log_ready, timeout_secs)
    )

DEBUG = {}
