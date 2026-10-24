# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Migrate Script Builder

Assembles the complete /app/migrate.sh entrypoint that runs inside the
l4_migrator_runtime container.  Delegates each logical section to a
dedicated module so this file stays focused on overall script structure.

  secret_resolution  – resolves DATABASE_URL (Infisical or env vars)
  db_readiness       – waits for PostgreSQL to accept connections
"""

load('../../../../tilt/common/utils_debug.star', 'DEBUG_MODE')
load('./secret_resolution.star', 'secret_resolution_script')
load('./db_readiness.star', 'db_readiness_script')
load(
    './constants.star',
    'APP_DIR',
    'MIGRATE_SH_ABS_PATH',
    'PRISMA_BIN_ABS_PATH',
    'PRISMA_GENERATE_SUBCOMMAND',
    'PRISMA_MIGRATE_DEPLOY_SUBCOMMAND',
)


def _log(debug_msg, prod_msg = ""):
    """Return debug_msg when DEBUG_MODE is on, prod_msg otherwise."""
    return debug_msg if DEBUG_MODE else prod_msg


def _prisma_run_block():
    """
    Shell fragment that locates the local Prisma CLI binary and runs
    `migrate deploy` followed by `generate`.  Avoids `bunx prisma` to
    prevent accidental network fetches of the latest Prisma version.
    """
    return (
        "# Use locally installed Prisma CLI – avoids bunx fetching prisma@latest\n"
        + "PRISMA_BIN=\"" + PRISMA_BIN_ABS_PATH + "\"\n"
        + "if [ ! -x \"$PRISMA_BIN\" ]; then\n"
        + "  echo \"\\u274c ERROR: Prisma CLI not found at $PRISMA_BIN\"\n"
        + "  exit 1\n"
        + "fi\n"
        + "# Ensure DATABASE_URL is exported for Prisma CLI\n"
        + "export DATABASE_URL\n"
        + _log("echo \"\\U0001f504 Running Prisma migrations...\"\n")
        + "cd " + APP_DIR + " && \"$PRISMA_BIN\" " + PRISMA_MIGRATE_DEPLOY_SUBCOMMAND + "\n"
        + _log("echo \"\\U0001f527 Generating Prisma client...\"\n")
        + "\"$PRISMA_BIN\" " + PRISMA_GENERATE_SUBCOMMAND + "\n"
    )


def migrate_sh_content(resource_name):
    """
    Return the full text of migrate.sh for the given service.

    Args:
        resource_name: Used in RESOURCE_NAME env var and Infisical secret path
                      (e.g. 'user-service', 'order-service').
    """
    done_msg = (
        _log("echo \"\\U0001f389 Database migration completed successfully!\"\n")
        or "echo \"Database migration completed\"\n"
    )

    return (
        "#!/bin/sh\n"
        + "set -e\n"
        + _log(
            "echo \"\\U0001f5c4\\ufe0f Starting database migration for $RESOURCE_NAME...\"\n",
            "echo \"Starting database migration...\"\n",
        )
        + "\n# --- 1. Resolve DATABASE_URL ---\n"
        + secret_resolution_script()
        + "\n# --- 2. Wait for PostgreSQL ---\n"
        + db_readiness_script()
        + "\n# --- 3. Run Prisma migrate + generate ---\n"
        + _prisma_run_block()
        + "\n"
        + done_msg
    )


def migrate_sh_dockerfile_block(resource_name):
    """
    Return the Dockerfile fragment that writes migrate.sh and makes it executable.

    Args:
        resource_name: Forwarded to migrate_sh_content().
    """
    return (
        "# Provide the migrate entrypoint\n"
        + "RUN cat > " + MIGRATE_SH_ABS_PATH + " << 'EOF'\n"
        + migrate_sh_content(resource_name)
        + "EOF\n"
        + "RUN chmod +x " + MIGRATE_SH_ABS_PATH + "\n"
    )

DEBUG = {}
