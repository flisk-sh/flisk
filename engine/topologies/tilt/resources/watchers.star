# Copyright (c) 2026 Flisk contributors
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
        cmd='./.tdk/.tdk-out/tdk-cli-ext/engine/assets/scripts/cleanup-tilt-images.sh --keep 0 --force && docker image prune -f',
        resource_deps=[],
        labels=['dev.maintenance'],
        auto_init=False
    )

    local_resource('memory-optimizer',
        cmd='./.tdk/.tdk-out/tdk-cli-ext/engine/assets/scripts/mac-m1-resource-monitor.sh && ./.tdk/.tdk-out/tdk-cli-ext/engine/assets/scripts/cleanup-tilt-images.sh --keep 0 --force && docker image prune -f && docker builder prune -af --filter "until=24h"',
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
        serve_cmd='''
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
                ./.tdk/.tdk-out/tdk-cli-ext/engine/assets/scripts/cleanup-tilt-images.sh --keep 2 --force >/dev/null 2>&1 || true
                sleep 300
            done
        ''',
        resource_deps=[],
        labels=['dev.maintenance', 'mac-m1'],
        auto_init=True,
    )

    # Continuously reclaim heavyweight migrator images once migration succeeds.
    local_resource('auto-prune-migrator-images',
        serve_cmd='''
            echo "🧹 Migrator image cleanup started (every 45s)"
            while true; do
                ./.tdk/.tdk-out/tdk-cli-ext/engine/assets/scripts/cleanup-completed-migrator-images.sh || true
                sleep 45
            done
        ''',
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
        cmd='./.tdk/.tdk-out/ext/ui-enhancements/cron-status-tracker.sh init',
        labels=['dev.quality', 'cron', 'setup'],
        auto_init=True,
    )

    # Cron lint - runs every 60 seconds
    local_resource('cron-lint',
        serve_cmd='''
            echo "🧹 Cron lint started (every 60s) - auto-fixing issues..."
            ./.tdk/.tdk-out/ext/ui-enhancements/cron-status-tracker.sh update cron-lint running
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
                ./.tdk/.tdk-out/ext/ui-enhancements/cron-status-tracker.sh update cron-lint running

                if bun biome lint --write . 2>&1; then
                    end_time=$(date +%s)
                    duration=$((end_time - start_time))
                    echo "$(date +%H:%M:%S) ✅ Lint complete (${duration}s)"
                    ./.tdk/.tdk-out/ext/ui-enhancements/cron-status-tracker.sh update cron-lint success "${duration}s"
                else
                    end_time=$(date +%s)
                    duration=$((end_time - start_time))
                    echo "$(date +%H:%M:%S) ⚠️  Lint found issues (${duration}s)"
                    ./.tdk/.tdk-out/ext/ui-enhancements/cron-status-tracker.sh update cron-lint failure "${duration}s"
                fi

                echo "$(date +%H:%M:%S) 😴 Sleeping 60s..."
                sleep 60
            done
        ''',
        resource_deps=['cron-status-init'],
        labels=['dev.quality', 'cron'],
        auto_init=True,
    )

    # Cron format - runs every 60 seconds
    local_resource('cron-format',
        serve_cmd='''
            echo "🎨 Cron format started (every 60s) - auto-fixing formatting..."
            ./.tdk/.tdk-out/ext/ui-enhancements/cron-status-tracker.sh update cron-format running
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
                ./.tdk/.tdk-out/ext/ui-enhancements/cron-status-tracker.sh update cron-format running

                if bun biome check --write . && bun biome format --write . 2>&1; then
                    end_time=$(date +%s)
                    duration=$((end_time - start_time))
                    echo "$(date +%H:%M:%S) ✅ Format complete (${duration}s)"
                    ./.tdk/.tdk-out/ext/ui-enhancements/cron-status-tracker.sh update cron-format success "${duration}s"
                else
                    end_time=$(date +%s)
                    duration=$((end_time - start_time))
                    echo "$(date +%H:%M:%S) ⚠️  Format had issues (${duration}s)"
                    ./.tdk/.tdk-out/ext/ui-enhancements/cron-status-tracker.sh update cron-format failure "${duration}s"
                fi

                echo "$(date +%H:%M:%S) 😴 Sleeping 60s..."
                sleep 60
            done
        ''',
        resource_deps=['cron-status-init'],
        labels=['dev.quality', 'cron'],
        auto_init=True,
    )

    # Status HTTP server for cron jobs
    local_resource('cron-jobs-status-server',
        serve_cmd='./.tdk/.tdk-out/ext/ui-enhancements/cron-status-server.sh',
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
