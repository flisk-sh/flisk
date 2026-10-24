# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Bun Helper Functions
"""

def bun_hoisted_packages_symlink_fix():
    """
    Fix all Bun-hoisted package symlinks in node_modules.
    
    When packages are installed with Bun's isolated store, they may be symlinked
    from node_modules to .bun/. These symlinks break when copied to Docker.
    This function recreates the necessary symlinks for runtime resolution.
    
    Handles:
    - Regular packages with nested node_modules (e.g., hono)
    - Scoped packages (@hono/*, @prisma/*)
    """
    return (
        "# Fix Bun hoisted package symlinks that break when copied to Docker\n"
        + "USER root\n"
        + "COPY shared-platform-engineering/docker-templates/bun-hoisted-symlink-fix.sh /usr/local/bin/bun-hoisted-symlink-fix.sh\n"
        + "RUN chmod +x /usr/local/bin/bun-hoisted-symlink-fix.sh && /usr/local/bin/bun-hoisted-symlink-fix.sh\n"
        + "USER bun\n"
    )
