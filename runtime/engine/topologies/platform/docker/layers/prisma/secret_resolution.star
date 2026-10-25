# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Secret Resolution Shell Fragment

Generates the shell script block responsible for resolving DATABASE_URL at
runtime.  Priority order:
  1. Infisical API (when INFISICAL_TOKEN + INFISICAL_PROJECT_ID are present)
  2. Individual DB_* env vars assembled into a connection string
  3. Pre-injected DATABASE_URL (docker-compose / Tilt direct injection)

Returns a plain string that is embedded verbatim inside migrate.sh.
"""

load('../../../../tilt/common/utils_debug.star', 'DEBUG_MODE')
load(
    './constants.star',
    'DATABASE_URL_UNSET_CONDITION',
    'DB_URL_COMPONENT_ENV_KEYS',
    'DB_URL_FROM_COMPONENTS',
    'DEFAULT_INFISICAL_URL',
    'INFISICAL_SECRET_ENV_KEYS',
)
load('../../../../tilt/generators/infisical/path_manager.star', 'PathManager')


def _export_secret_line(secret_key):
    return (
        "    export " + secret_key + "=$(echo \"$RESPONSE\" | jq -r --arg k \"" + secret_key + "\" "
        + "'.secrets[] | select(.secretKey==$k) | .secretValue' || true)\n"
    )


def _infisical_export_block():
    lines = []
    for secret_key in INFISICAL_SECRET_ENV_KEYS:
        lines.append(_export_secret_line(secret_key))
    return "".join(lines)


def _all_env_present_condition(env_keys):
    checks = []
    for env_key in env_keys:
        checks.append("[ -n \"$" + env_key + "\" ]")
    return " && ".join(checks)


def _infisical_fetch_block(log_fetch, log_fetch_ok, log_fetch_fail):
    """Build the Infisical curl block using Starlark path manager."""
    else_block = ("  else\n" + log_fetch_fail + "  fi\n") if log_fetch_fail else "  fi\n"
    # Use default database subpath from PathManager constants
    default_secret_path = PathManager.RESOURCE_SUBPATHS[0] if PathManager.RESOURCE_SUBPATHS else ""
    # Note: In shell, we use env var with fallback. The actual path resolution
    # happens at runtime, but we document the Starlark-managed path convention here.
    return (
        "if [ -n \"$INFISICAL_TOKEN\" ] && [ -n \"$INFISICAL_PROJECT_ID\" ]; then\n"
        + log_fetch
        + "  INFISICAL_URL=\"${INFISICAL_API_URL:-${INFISICAL_URL:-" + DEFAULT_INFISICAL_URL + "}}\"\n"
        + "  INFISICAL_ENV=\"${INFISICAL_ENVIRONMENT:-dev}\"\n"
        + "  # Using Starlark-managed path: /services/$RESOURCE_NAME" + default_secret_path + "\n"
        + "  SECRET_PATH=\"${INFISICAL_SECRET_PATH:-/services/$RESOURCE_NAME/database}\"\n"
        + "  RESPONSE=$(curl -s -f -H \"Authorization: Bearer $INFISICAL_TOKEN\" "
        + "\"${INFISICAL_URL}/api/v3/secrets/raw?environment=${INFISICAL_ENV}"
        + "&workspaceId=${INFISICAL_PROJECT_ID}&secretPath=${SECRET_PATH}\") || true\n"
        + "  if [ -n \"$RESPONSE\" ]; then\n"
        + log_fetch_ok
        + _infisical_export_block()
        + else_block
        + "fi\n"
    )


def _component_url_build_block(log_built):
    """Build DATABASE_URL from individual DB_* parts when it is absent."""
    components_ready = _all_env_present_condition(DB_URL_COMPONENT_ENV_KEYS)
    return (
        "# Build DATABASE_URL from components if not present\n"
        + "if " + DATABASE_URL_UNSET_CONDITION + "; then\n"
        + "  if " + components_ready + "; then\n"
        + "    export DATABASE_URL=\"" + DB_URL_FROM_COMPONENTS + "\"\n"
        + log_built
        + "  fi\n"
        + "fi\n"
    )


def _validate_url_block():
    """Hard-fail when DATABASE_URL is still missing after all attempts."""
    return (
        "if " + DATABASE_URL_UNSET_CONDITION + "; then\n"
        + "  echo \"\\u274c ERROR: DATABASE_URL is not set."
        + " Set it via Infisical or environment variables.\"\n"
        + "  exit 1\n"
        + "fi\n"
    )


def secret_resolution_script():
    """
    Return the complete shell fragment that resolves DATABASE_URL.

    Uses DEBUG_MODE to include/suppress verbose log lines.
    """
    if DEBUG_MODE:
        log_fetch      = "  echo \"\\U0001f510 Fetching secrets from Infisical...\"\n"
        log_fetch_ok   = "    echo \"\\u2705 Successfully fetched secrets from Infisical\"\n"
        log_fetch_fail = "    echo \"\\u26a0\\ufe0f  Infisical did not return secrets (or not reachable)\"\n"
        log_built      = "    echo \"\\U0001f511 Built DATABASE_URL from components\"\n"
    else:
        log_fetch = ""
        log_fetch_ok = ""
        log_fetch_fail = ""
        log_built = ""

    return (
        _infisical_fetch_block(log_fetch, log_fetch_ok, log_fetch_fail)
        + _component_url_build_block(log_built)
        + _validate_url_block()
    )

DEBUG = {}
