# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Filesystem Setup Dockerfile Fragment

Generates the RUN/COPY instructions that:
  - (The Alpine tools migrate.sh needs - jq, nc - are in the golden l4-migrator image, not installed here)
  - Create required directories and fix ownership so Prisma can write generated files

All functions return Dockerfile instruction strings.
"""

load(
    '../bun_helpers.star',
    'bun_hoisted_packages_symlink_fix',
)
load(
    './constants.star',
    'APP_DIR',
    'APP_GENERATED_CLIENT_DIR',
    'APP_NODE_MODULES_DIR',
    'APP_PRISMA_DIR',
    'APP_SRC_DIR',
    'BUN_USER',
    'PRISMA_CONFIG_ABS_PATH',
    'PRISMA_SCHEMA_PATH',
)


def prisma_dir_and_permissions():
    """
    Create directories that Prisma writes to at runtime and ensure the `bun` user owns
    them.  Handles both the standard `node_modules/.prisma/client` path and custom
    output paths like `../src/generated` or `../generated-client`.

    node_modules is not chowned here: it arrives owned by `bun` (`COPY --chown`, see prisma_runtime.star). A `chown -R` over it
    in its own RUN rewrites every file into a second layer, which doubled the migrator image (332 MB of 1.5 GB).

    `/app` itself is owned by `bun` too: `migrate.sh` runs `prisma generate` as `bun`,
    and a generator output such as `../generated/prisma` (the `flisk resource
    --feature prisma` scaffold) makes Prisma create a new directory directly under
    `/app`, which fails with EACCES while root owns it.
    """
    return (
        "# Ensure Prisma can write generated files including custom output paths\n"
        + "RUN mkdir -p " + APP_NODE_MODULES_DIR + " " + APP_SRC_DIR + " " + APP_GENERATED_CLIENT_DIR
        + " && chown " + BUN_USER + ":" + BUN_USER + " " + APP_DIR
        + " && chown -R " + BUN_USER + ":" + BUN_USER
        + " " + APP_PRISMA_DIR + " " + APP_SRC_DIR + " " + APP_GENERATED_CLIENT_DIR
        + " " + PRISMA_CONFIG_ABS_PATH + " || true\n"
    )


def prisma_config_inline():
    """
    Inline-generate /app/prisma.config.ts so Prisma v7 migration commands pick up
    the datasource URL from the environment without requiring a build-time file copy.
    """
    return (
        "# Prisma v7 migration commands require datasource.url in prisma.config.ts\n"
        + "RUN cat > " + PRISMA_CONFIG_ABS_PATH + " << 'EOF'\n"
        + "export default {\n"
        + "  schema: '" + PRISMA_SCHEMA_PATH + "',\n"
        + "  datasource: {\n"
        + "    url: process.env.DATABASE_URL,\n"
        + "  },\n"
        + "};\n"
        + "EOF\n"
    )


def migrator_filesystem_setup():
    """
    Convenience wrapper – returns all filesystem setup instructions in order:
      1. Inline prisma.config.ts
      2. Permission fixes
      3. General Bun hoisted packages symlink fix

    The @prisma links are not rebuilt here: the old relink step replaced the symlinks into node_modules/.bun with real copies
    of @prisma/client, adapter-pg and engines, which stored those 98 MB a second time in their own layer (#4070). The relative
    symlinks that arrive with the node_modules COPY resolve as they are.

    The caller is responsible for wrapping these in `USER root` / `USER bun` guards.
    """
    return (
        prisma_config_inline()
        + prisma_dir_and_permissions()
        + bun_hoisted_packages_symlink_fix()
    )
