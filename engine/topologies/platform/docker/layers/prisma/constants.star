# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
# === INLINED CONSTANTS for pure extension loading ===
RUNTIME = "bun"
# === END INLINED CONSTANTS ===


"""
Shared constants/helpers for Prisma Docker layer generators.

Centralizes repeated paths/defaults used across prisma_*.star modules so
string-heavy Dockerfile/script fragments stay consistent and reusable.
"""



APP_DIR = "/app"
NODE_MODULES_DIR = "node_modules"
NODE_MODULES_BIN_DIR = NODE_MODULES_DIR + "/.bin"
APP_NODE_MODULES_DIR = APP_DIR + "/" + NODE_MODULES_DIR
APP_NODE_MODULES_BIN_DIR = APP_NODE_MODULES_DIR + "/.bin"
APP_BUN_STORE_DIR = APP_NODE_MODULES_DIR + "/.bun"

PRISMA_DIR_NAME = "prisma"
PRISMA_SCOPE_DIR_NAME = "@prisma"
PRISMA_SCHEMA_PATH = PRISMA_DIR_NAME + "/schema.prisma"

PRISMA_CONFIG_FILE = "prisma.config.ts"
PRISMA_CONFIG_WORKDIR_PATH = "./" + PRISMA_CONFIG_FILE
PRISMA_CONFIG_ABS_PATH = APP_DIR + "/" + PRISMA_CONFIG_FILE

APP_SRC_DIR = APP_DIR + "/src"
APP_GENERATED_CLIENT_DIR = APP_DIR + "/generated-client"
APP_PRISMA_DIR = APP_DIR + "/" + PRISMA_DIR_NAME

PRISMA_DOT_DIR_REL_PATH = NODE_MODULES_DIR + "/.prisma"
PRISMA_DOT_CLIENT_REL_PATH = PRISMA_DOT_DIR_REL_PATH + "/client"
PRISMA_DOT_CLIENT_ABS_PATH = APP_DIR + "/" + PRISMA_DOT_CLIENT_REL_PATH

PRISMA_BIN_REL_PATH = NODE_MODULES_DIR + "/.bin/prisma"
PRISMA_BIN_ABS_PATH = APP_DIR + "/" + PRISMA_BIN_REL_PATH
PRISMA_BIN_SYMLINK_TARGET = "../prisma/build/index.js"

PRISMA_PACKAGE_REL_PATH = NODE_MODULES_DIR + "/prisma"
PRISMA_SCOPE_REL_PATH = NODE_MODULES_DIR + "/" + PRISMA_SCOPE_DIR_NAME
PRISMA_ENGINES_REL_PATH = PRISMA_SCOPE_REL_PATH + "/engines"
PRISMA_PACKAGE_NODE_MODULES_REL_PATH = PRISMA_PACKAGE_REL_PATH + "/node_modules"

APP_PRISMA_PACKAGE_DIR = APP_NODE_MODULES_DIR + "/" + PRISMA_DIR_NAME
APP_PRISMA_SCOPE_DIR = APP_NODE_MODULES_DIR + "/" + PRISMA_SCOPE_DIR_NAME
APP_PRISMA_ENGINES_DIR = APP_PRISMA_SCOPE_DIR + "/engines"
APP_PRISMA_PACKAGE_NODE_MODULES_DIR = APP_PRISMA_PACKAGE_DIR + "/node_modules"
APP_PRISMA_PACKAGE_ENGINES_DIR = APP_PRISMA_PACKAGE_NODE_MODULES_DIR + "/" + PRISMA_SCOPE_DIR_NAME + "/engines"

PRISMA_CLIENT_PACKAGE_REL_PATH = PRISMA_SCOPE_REL_PATH + "/client"
BUN_PRISMA_CLIENT_LINKER_NODE_MODULES_GLOB = NODE_MODULES_DIR + "/.bun/@prisma+client*/node_modules"

MIGRATE_SH_FILE = "migrate.sh"
MIGRATE_SH_ABS_PATH = APP_DIR + "/" + MIGRATE_SH_FILE

L3_MIGRATION_BUILD_STAGE = "l3_migration_build"

ROOT_USER = "root"
BUN_USER = RUNTIME

PRISMA_GENERATE_COMMAND = "bunx prisma generate"
PRISMA_GENERATE_RUN = "RUN " + PRISMA_GENERATE_COMMAND + "\n"
PRISMA_MIGRATE_DEPLOY_SUBCOMMAND = "migrate deploy"
PRISMA_GENERATE_SUBCOMMAND = "generate"

# Load project name for dynamic golden image naming
# Use TDK_PROJECT_ROOT env var set by Tilt, fallback to current directory
def _load_golden_prefix():
    project_root = os.environ.get('TDK_PROJECT_ROOT', '')
    project_json_path = '.tdk/project.json'
    if project_root:
        project_json_path = project_root + '/' + project_json_path
    
    if os.path.exists(project_json_path):
        _project_json = read_json(project_json_path)
        return _project_json.get('project', {}).get('name', 'tdk-project')
    return 'tdk-project'

_GOLDEN_PREFIX = _load_golden_prefix()

# Migrators build on l3-backend; the golden build no longer makes a separate l3-migrator image.
DEFAULT_GOLDEN_L3_MIGRATOR_IMAGE = _GOLDEN_PREFIX + "-l3-backend:latest"
DEFAULT_GOLDEN_L4_MIGRATOR_IMAGE = _GOLDEN_PREFIX + "-l4-migrator:latest"

DEFAULT_DB_PORT = "5432"
DEFAULT_DB_WAIT_TIMEOUT_SECS = 120
DB_URL_HOSTPORT_WITH_AUTH_SED = "sed -n 's#^[^/]*//[^@]*@\\([^/]*\\)/.*#\\1#p'"
DB_URL_HOSTPORT_NO_AUTH_SED = "sed -n 's#^[^/]*//\\([^/]*\\)/.*#\\1#p'"

DEFAULT_INFISICAL_URL = "http://" + _GOLDEN_PREFIX + "-infisical:8081"
DATABASE_URL_UNSET_CONDITION = "[ -z \"$DATABASE_URL\" ] || [ \"$DATABASE_URL\" = \"null\" ]"
INFISICAL_SECRET_ENV_KEYS = [
    "DATABASE_URL",
    "DB_USER",
    "DB_PASSWORD",
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
]
DB_URL_COMPONENT_ENV_KEYS = [
    "DB_USER",
    "DB_PASSWORD",
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
]
DB_URL_FROM_COMPONENTS = "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"


def app_resource_dir(res_path):
    return APP_DIR + "/" + res_path


def resource_node_modules_dir(res_path):
    return app_resource_dir(res_path) + "/" + NODE_MODULES_DIR


def prisma_normalize_output_block(include_generated_client_export = True):
    """
    Shared Prisma client normalization instructions used in both generic and
    migration-engine build flows.

    Args:
        include_generated_client_export: Include generated-client.ts shim line.
    """
    export_flag = "1" if include_generated_client_export else "0"
    return (
        "# Normalize Prisma output for both import styles using shared script\n"
        + "COPY shared-platform-engineering/docker-templates/prisma-normalize-client.sh /usr/local/bin/prisma-normalize-client.sh\n"
        + "RUN chmod +x /usr/local/bin/prisma-normalize-client.sh && PRISMA_EXPORT_GENERATED_CLIENT="
        + export_flag
        + " /usr/local/bin/prisma-normalize-client.sh\n"
    )
