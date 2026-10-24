# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Filesystem Setup Dockerfile Fragment

Generates the RUN/COPY instructions that:
  - Install Alpine utilities needed by migrate.sh at runtime (curl, jq, nc)
  - Create required directories and fix ownership so Prisma can write generated files
  - Ensure @prisma/engines is resolvable for the CLI (engines may land under
    prisma/node_modules in Bun hoisting layouts)

All functions return Dockerfile instruction strings.
"""

load(
    '../bun_helpers.star',
    'bun_hoisted_packages_symlink_fix',
)
load(
    './constants.star',
    'APP_BUN_STORE_DIR',
    'APP_GENERATED_CLIENT_DIR',
    'APP_NODE_MODULES_BIN_DIR',
    'APP_NODE_MODULES_DIR',
    'APP_PRISMA_DIR',
    'APP_PRISMA_PACKAGE_DIR',
    'APP_PRISMA_SCOPE_DIR',
    'APP_SRC_DIR',
    'BUN_USER',
    'PRISMA_BIN_ABS_PATH',
    'PRISMA_BIN_SYMLINK_TARGET',
    'PRISMA_CONFIG_ABS_PATH',
    'PRISMA_SCHEMA_PATH',
)


def apk_runtime_tools():
    """
    Install runtime utilities required by migrate.sh: bash, curl, jq, netcat-openbsd, postgresql-client.
    """
    return "RUN apk add --no-cache bash curl jq netcat-openbsd postgresql-client\n"


def prisma_dir_and_permissions():
    """
    Create directories that Prisma writes to at runtime and ensure the `bun` user owns
    them.  Handles both the standard `node_modules/.prisma/client` path and custom
    output paths like `../src/generated` or `../generated-client`.
    """
    return (
        "# Ensure Prisma can write generated files including custom output paths\n"
        + "RUN mkdir -p " + APP_NODE_MODULES_DIR + " " + APP_SRC_DIR + " " + APP_GENERATED_CLIENT_DIR
        + " && chown -R " + BUN_USER + ":" + BUN_USER
        + " " + APP_PRISMA_DIR + " " + APP_NODE_MODULES_DIR + " " + APP_SRC_DIR + " " + APP_GENERATED_CLIENT_DIR
        + " " + PRISMA_CONFIG_ABS_PATH + " || true\n"
    )


def prisma_engines_symlink():
    """
    Rebuild @prisma links from Bun's isolated store after cross-stage COPY.
    Service-level node_modules symlinks are relative and can break when copied to
    `/app/node_modules`. We relink from `/app/node_modules/.bun`.
    
    Handles two types of packages:
    1. Nested packages: @prisma/client, @prisma/adapter-pg (under node_modules/@prisma/)
    2. Top-level package: @prisma/engines (copied as real files, not symlinked)
    """
    return (
        "# Re-link @prisma packages from Bun store so Prisma CLI can resolve engines\n"
        # Written inline: the template this used to COPY is not shipped anywhere.
        + "RUN cat > /usr/local/bin/prisma-runtime-relink.sh << 'EOF'\n"
        + "#!/bin/sh\n"
        + "set -e\n"
        + "# Nested @prisma packages: replace the symlink into node_modules/.bun with a real copy.\n"
        + "for name in client adapter-pg; do\n"
        + "  src=$(ls -d /app/node_modules/.bun/@prisma+${name}@*/node_modules/@prisma/${name} 2>/dev/null | head -n 1 || true)\n"
        + "  if [ -n \"$src\" ]; then\n"
        + "    rm -rf /app/node_modules/@prisma/${name}\n"
        + "    mkdir -p /app/node_modules/@prisma\n"
        + "    cp -R \"$src\" /app/node_modules/@prisma/${name}\n"
        + "  fi\n"
        + "done\n"
        + "# Top-level @prisma/engines: copy as real files, not a symlink.\n"
        + "src=$(ls -d /app/node_modules/.bun/@prisma+engines@*/node_modules/@prisma/engines 2>/dev/null | head -n 1 || true)\n"
        + "if [ -n \"$src\" ]; then\n"
        + "  rm -rf /app/node_modules/@prisma/engines\n"
        + "  mkdir -p /app/node_modules/@prisma\n"
        + "  cp -R \"$src\" /app/node_modules/@prisma/engines\n"
        + "fi\n"
        + "EOF\n"
        + "RUN chmod +x /usr/local/bin/prisma-runtime-relink.sh && /usr/local/bin/prisma-runtime-relink.sh\n"
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
      3. @prisma/engines symlink
      4. Alpine utilities
      5. General Bun hoisted packages symlink fix

    The caller is responsible for wrapping these in `USER root` / `USER bun` guards.
    """
    return (
        prisma_config_inline()
        + prisma_dir_and_permissions()
        + prisma_engines_symlink()
        + apk_runtime_tools()
        + bun_hoisted_packages_symlink_fix()
    )
