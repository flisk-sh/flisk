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


def bun_dev_script(res_path):
    """The `dev` script of a service's package.json, or '' without one (found the way the runtime stage finds `start`)."""
    package_json_path = res_path + '/package.json'
    if not res_path.startswith('/'):
        package_json_path = os.environ.get('FLISK_PROJECT_ROOT', '.') + '/' + package_json_path
    if not os.path.exists(package_json_path):
        return ''
    package_json = read_json(package_json_path, default = {}) or {}
    scripts = package_json.get('scripts', {}) or {}
    script = scripts.get('dev', '')
    return script if type(script) == 'string' else ''


def bun_dev_script_watches(script):
    """True when a `dev` script keeps Bun under a watcher (`bun --watch`, `bun run --watch`, `--hot`), so a synced edit restarts it."""
    tokens = (script or '').split()
    return 'bun' in tokens and ('--watch' in tokens or '--hot' in tokens)
