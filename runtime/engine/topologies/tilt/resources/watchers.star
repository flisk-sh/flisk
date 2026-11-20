# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 👁️ TILT SDK - FILE WATCHERS
# =============================================================================
# Path: .tilt/provisioner/watchers.star
# Purpose: Set up file watchers for automatic config regeneration
# =============================================================================
#
# This module sets up watchers for package.json files across all services.
# When a developer runs `bun add @flisk/x`, the watcher triggers
# automatic regeneration of TSConfig and Vite configurations.
#
# Usage:
#   Watchers.setup_package_json(services, should_enable_fn)
# =============================================================================

# Native Windows runs Tilt string commands through cmd.exe: it cannot execute
# ./script.sh, and the maintenance loops need date, sleep and /tmp. Every
# maintenance resource below therefore goes through maintenance_command(): POSIX
# keeps its bash script, Windows gets a no-op that prints why in the Tilt UI.
# FLISK_WATCHERS_PORTABLE=1 forces the Windows branch on any host for tests.
load('../../../../discovery/native_windows.star', 'POWERSHELL')

IS_NATIVE_WINDOWS = os.name == "nt" or os.getenv("FLISK_WATCHERS_PORTABLE") == "1"

_IMAGE_SKIP_REASON = 'image maintenance needs bash and POSIX tools; skipped on native Windows (use WSL2 or run the cleanup manually)'
_MONITOR_SKIP_REASON = 'macOS memory monitoring needs bash and POSIX tools; skipped on native Windows'
_CRON_SKIP_REASON = 'cron status tracking needs POSIX shell scripts and /tmp; skipped on native Windows (see docs/design/native-windows-runtime-decision.md)'

def _ps_quote(text):
    """A PowerShell single-quoted literal (an embedded quote is doubled)."""
    return "'" + text.replace("'", "''") + "'"

def windows_skip_command(name, reason, serve = False):
    """PowerShell command that reports why a maintenance resource is skipped on native Windows.

    A serve_cmd must keep running: if it exits, Tilt marks the resource red even with exit code 0.
    """
    wait = "while ($true) { Start-Sleep -Seconds 300 }" if serve else "exit 0"
    body = "Write-Output " + _ps_quote("[flisk] " + name + ": " + reason) + "; " + wait
    return POWERSHELL + [body]

def maintenance_command(name, posix_command, reason, is_windows, serve = False):
    """The command Tilt runs: the bash script off Windows, a documented no-op on Windows."""
    if is_windows:
        return windows_skip_command(name, reason, serve)
    return posix_command

if IS_NATIVE_WINDOWS:
    print('[flisk] watchers: native Windows uses no-op maintenance resources; POSIX bash scripts need WSL2 (see docs/design/native-windows-runtime-decision.md)')

# =============================================================================
# 📦 PACKAGE.JSON WATCHERS
# =============================================================================

def setup_package_json_watchers(services, should_enable):
    """
    Set up file watchers for package.json across all services.
    
    When package.json changes (e.g., via `bun add @flisk/x`),
    Tilt will automatically trigger config regeneration.
    
    Args:
        services: List of APP_RESOURCES from registry
        should_enable: Function that takes service name and returns bool
    """
    watched_paths = []
    
    for app_service in services:
        service_name = app_service.get('name', '')
        if not service_name:
            continue
        if not should_enable(service_name):
            continue
        
        resource_path = app_service.get('path', '')
        if not resource_path:
            # Skip services without path (libraries or incomplete manifests)
            continue
        
        for resource in app_service.get('resources', []):
            resource_name = resource.get('name', '')
            if not resource_name:
                continue
            full_resource_path = resource_path + '/' + resource_name
            pkg_json_path = full_resource_path + '/package.json'
            
            if pkg_json_path not in watched_paths:
                watched_paths.append(pkg_json_path)
                watch_file(pkg_json_path)
    
    if watched_paths:
        print("📦 ═══════════════════════════════════════════════════════════════")
        print("📦  AUTOMATIC BRIDGE: Watching " + str(len(watched_paths)) + " package.json files")
        print("📦  When you 'bun add @flisk/x', configs auto-regenerate!")
        print("📦 ═══════════════════════════════════════════════════════════════")
    
    return watched_paths


# =============================================================================
# 🛠️ UTILITY RESOURCES
# =============================================================================

def setup_utility_resources():
    """Set up common utility resources."""
    local_resource('lint', 
        cmd='bun biome lint --write .', 
        labels=['dev.quality'], 
        auto_init=False
    )
    
    local_resource('format', 
        cmd='bun biome check --write . && bun biome format --write .', 
        labels=['dev.quality'], 
        auto_init=False
    )
    
    local_resource('build-shared', 
        cmd='bun run build:shared', 
        labels=['dev.quality'], 
        auto_init=False
    )
    
    local_resource('prune-images',
        cmd=maintenance_command(
            'prune-images',
            'bash ./.flisk/.flisk-out/flisk-cli-ext/engine/assets/scripts/cleanup-tilt-images.sh --keep 0 --force && docker image prune -f',
            _IMAGE_SKIP_REASON,
            IS_NATIVE_WINDOWS,
        ),
        resource_deps=[],
        labels=['dev.maintenance'],
        auto_init=False
    )

    local_resource('memory-optimizer',
        cmd=maintenance_command(
            'memory-optimizer',
            'bash ./.flisk/.flisk-out/flisk-cli-ext/engine/assets/scripts/mac-m1-resource-monitor.sh && bash ./.flisk/.flisk-out/flisk-cli-ext/engine/assets/scripts/cleanup-tilt-images.sh --keep 0 --force && docker image prune -f && docker builder prune -af --filter "until=24h"',
            _MONITOR_SKIP_REASON,
            IS_NATIVE_WINDOWS,
        ),
        resource_deps=[],
        labels=['dev.maintenance', 'mac-m1'],
        auto_init=False
    )

    local_resource('prune-builder-cache',
        cmd='docker builder prune -af && docker image prune -f',
        resource_deps=[],
        labels=['dev.maintenance', 'mac-m1'],
        auto_init=False
    )
    
    # Continuous dangling image cleanup - runs every 5 minutes via serve_cmd loop
    local_resource('auto-prune-dangling',
        serve_cmd=maintenance_command(
            'auto-prune-dangling',
            '''
            echo "🧹 Auto-prune started (every 300s)"
            while true; do
                count=$(docker images -f "dangling=true" -q 2>/dev/null | wc -l | tr -d ' ')
                if [ "$count" -gt "5" ]; then
                    echo "$(date +%H:%M:%S) 🧹 Cleaning $count dangling images..."
                    docker image prune -f 2>/dev/null || true
                else
                    echo "$(date +%H:%M:%S) ✓ $count dangling images (threshold: 5)"
                fi
                # Tilt tags every build as tilt-<hash>, so superseded builds stay tagged
                # and are never dangling. Keep the newest 2 per service; running images are skipped.
                bash ./.flisk/.flisk-out/flisk-cli-ext/engine/assets/scripts/cleanup-tilt-images.sh --keep 2 --force >/dev/null 2>&1 || true
                sleep 300
            done
            ''',
            _IMAGE_SKIP_REASON,
            IS_NATIVE_WINDOWS,
            serve=True,
        ),
        resource_deps=[],
        labels=['dev.maintenance', 'mac-m1'],
        auto_init=True,
    )

    # Continuously reclaim heavyweight migrator images once migration succeeds.
    local_resource('auto-prune-migrator-images',
        serve_cmd=maintenance_command(
            'auto-prune-migrator-images',
            '''
            echo "🧹 Migrator image cleanup started (every 45s)"
            while true; do
                bash ./.flisk/.flisk-out/flisk-cli-ext/engine/assets/scripts/cleanup-completed-migrator-images.sh || true
                sleep 45
            done
            ''',
            _IMAGE_SKIP_REASON,
            IS_NATIVE_WINDOWS,
            serve=True,
        ),
        resource_deps=[],
        labels=['dev.maintenance'],
        auto_init=True,
    )


def setup_dependency_sync_status():
    """Set up dependency sync status display resource."""
    local_resource('dependency-sync-status',
        cmd='''
echo "🔄 ═══════════════════════════════════════════════════════════════"
echo "🔄  AUTOMATED DEPENDENCY SYNCHRONIZATION STATUS v2.0"
echo "🔄  SDK: engine/ directory structure"
echo "🔄 ═══════════════════════════════════════════════════════════════"
echo ""
echo "🚀 AUTOMATIC BRIDGE - HOW IT WORKS:"
echo "   1. bun add @flisk/auth"
echo "   2. Tilt watches package.json"
echo "   3. TSConfig/Vite/Manifest auto-update"
echo ""
echo "🎯 CONVENTION OVER CONFIGURATION:"
echo "   @flisk/platform-x → shared-platform-engineering/platform-x/src"
echo "   @flisk/product-x  → shared-product-engineering/product-x/src"
echo ""
echo "🔄 ═══════════════════════════════════════════════════════════════"
''',
        labels=['dev.tools', 'dependency-sync'],
        auto_init=False
    )


def setup_cron_resources():
    """Set up cron job resources that run periodically."""
    # Initialize status tracking
    local_resource('cron-status-init',
        cmd=maintenance_command(
            'cron-status-init',
            'bash ./.flisk/.flisk-out/ext/ui-enhancements/cron-status-tracker.sh init',
            _CRON_SKIP_REASON,
            IS_NATIVE_WINDOWS,
        ),
        labels=['dev.quality', 'cron', 'setup'],
        auto_init=True,
    )

    # Cron lint - runs every 60 seconds
    local_resource('cron-lint',
        serve_cmd=maintenance_command(
            'cron-lint',
            '''
            echo "🧹 Cron lint started (every 60s) - auto-fixing issues..."
            bash ./.flisk/.flisk-out/ext/ui-enhancements/cron-status-tracker.sh update cron-lint running
            while true; do
                start_time=$(date +%s)

                # Check for pause signal
                if [ -f /tmp/cron-jobs-control/cron-lint.pause ]; then
                    echo "$(date +%H:%M:%S) ⏸️  cron-lint paused"
                    sleep 5
                    continue
                fi

                # Check for manual trigger
                if [ -f /tmp/cron-jobs-control/cron-lint.trigger ]; then
                    rm /tmp/cron-jobs-control/cron-lint.trigger
                    echo "$(date +%H:%M:%S) ▶️  Manual trigger received"
                fi

                echo "$(date +%H:%M:%S) 🧹 Running lint..."
                bash ./.flisk/.flisk-out/ext/ui-enhancements/cron-status-tracker.sh update cron-lint running

                if bun biome lint --write . 2>&1; then
                    end_time=$(date +%s)
                    duration=$((end_time - start_time))
                    echo "$(date +%H:%M:%S) ✅ Lint complete (${duration}s)"
                    bash ./.flisk/.flisk-out/ext/ui-enhancements/cron-status-tracker.sh update cron-lint success "${duration}s"
                else
                    end_time=$(date +%s)
                    duration=$((end_time - start_time))
                    echo "$(date +%H:%M:%S) ⚠️  Lint found issues (${duration}s)"
                    bash ./.flisk/.flisk-out/ext/ui-enhancements/cron-status-tracker.sh update cron-lint failure "${duration}s"
                fi

                echo "$(date +%H:%M:%S) 😴 Sleeping 60s..."
                sleep 60
            done
            ''',
            _CRON_SKIP_REASON,
            IS_NATIVE_WINDOWS,
            serve=True,
        ),
        resource_deps=['cron-status-init'],
        labels=['dev.quality', 'cron'],
        auto_init=True,
    )

    # Cron format - runs every 60 seconds
    local_resource('cron-format',
        serve_cmd=maintenance_command(
            'cron-format',
            '''
            echo "🎨 Cron format started (every 60s) - auto-fixing formatting..."
            bash ./.flisk/.flisk-out/ext/ui-enhancements/cron-status-tracker.sh update cron-format running
            while true; do
                start_time=$(date +%s)

                # Check for pause signal
                if [ -f /tmp/cron-jobs-control/cron-format.pause ]; then
                    echo "$(date +%H:%M:%S) ⏸️  cron-format paused"
                    sleep 5
                    continue
                fi

                # Check for manual trigger
                if [ -f /tmp/cron-jobs-control/cron-format.trigger ]; then
                    rm /tmp/cron-jobs-control/cron-format.trigger
                    echo "$(date +%H:%M:%S) ▶️  Manual trigger received"
                fi

                echo "$(date +%H:%M:%S) 🎨 Running format..."
                bash ./.flisk/.flisk-out/ext/ui-enhancements/cron-status-tracker.sh update cron-format running

                if bun biome check --write . && bun biome format --write . 2>&1; then
                    end_time=$(date +%s)
                    duration=$((end_time - start_time))
                    echo "$(date +%H:%M:%S) ✅ Format complete (${duration}s)"
                    bash ./.flisk/.flisk-out/ext/ui-enhancements/cron-status-tracker.sh update cron-format success "${duration}s"
                else
                    end_time=$(date +%s)
                    duration=$((end_time - start_time))
                    echo "$(date +%H:%M:%S) ⚠️  Format had issues (${duration}s)"
                    bash ./.flisk/.flisk-out/ext/ui-enhancements/cron-status-tracker.sh update cron-format failure "${duration}s"
                fi

                echo "$(date +%H:%M:%S) 😴 Sleeping 60s..."
                sleep 60
            done
            ''',
            _CRON_SKIP_REASON,
            IS_NATIVE_WINDOWS,
            serve=True,
        ),
        resource_deps=['cron-status-init'],
        labels=['dev.quality', 'cron'],
        auto_init=True,
    )

    # Status HTTP server for cron jobs
    local_resource('cron-jobs-status-server',
        serve_cmd=maintenance_command(
            'cron-jobs-status-server',
            'bash ./.flisk/.flisk-out/ext/ui-enhancements/cron-status-server.sh',
            _CRON_SKIP_REASON,
            IS_NATIVE_WINDOWS,
            serve=True,
        ),
        resource_deps=['cron-status-init'],
        labels=['dev.quality', 'cron', 'api'],
        auto_init=True,
    )

    print("⏰ ═══════════════════════════════════════════════════════════════")
    print("⏰  CRON JOBS CONFIGURED")
    print("⏰  - cron-lint: runs every 60 seconds")
    print("⏰  - cron-format: runs every 60 seconds")
    print("⏰  - auto-prune-dangling: runs every 5 minutes (existing)")
    print("⏰  - auto-prune-migrator-images: runs every 45 seconds (existing)")
    print("⏰  - Status API: http://localhost:10352/api/cron-jobs-status")
    print("⏰ ═══════════════════════════════════════════════════════════════")


# =============================================================================
# 📦 WATCHERS STRUCT (Public API)
# =============================================================================

Watchers = struct(
    # Package.json watchers
    setup_package_json = setup_package_json_watchers,
    
    # Utility resources
    setup_utilities = setup_utility_resources,
    setup_dep_sync_status = setup_dependency_sync_status,
    setup_cron_resources = setup_cron_resources,
)
