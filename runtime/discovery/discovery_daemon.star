# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 👁️ DISCOVERY DAEMON - Continuous Service Monitoring
# =============================================================================
# Monitors filesystem for new resources and triggers incremental registration
# =============================================================================

load("./resource_snapshot.star", "ResourceSnapshot")
load("./registry.star", "CacheOps")
load("../engine/topologies/tilt/manifest/loader.star", "ManifestLoader")
# Discovery config - inlined for unified repo
def get_discovery_config():
    return {
        "scan_interval_seconds": 5,
        "max_scan_timeout_ms": 5000,
        "initial_scan_delay_seconds": 2,
        "scan_debounce_ms": 100,
    }

_DISCOVERY_CONFIG = get_discovery_config()

def run_discovery_daemon(
    scan_interval_seconds=_DISCOVERY_CONFIG["scan_interval_seconds"],
    focus_mode=False,
    focus_stacks=[],
    auto_init_new=True,
    on_new_resource=None,
    verbose=False
):
    """
    Run the discovery daemon with continuous monitoring loop.
    
    This function is designed to be called as a serve_cmd in a local_resource,
    running continuously to monitor for new resources.
    
    Args:
        scan_interval_seconds: Seconds between scans (default: from get_discovery_config)
        focus_mode: Whether focus mode is active
        focus_stacks: List of domains to focus on (empty = all)
        auto_init_new: Whether to auto-init new resources
        on_new_resource: Callback function for new resource detection
        verbose: Enable verbose logging
    """
    print("🔍 Discovery daemon starting...")
    print("  └─ Scan interval: {}s".format(scan_interval_seconds))
    print("  └─ Focus mode: {}".format("enabled" if focus_mode else "disabled"))
    print("  └─ Auto-init: {}".format("enabled" if auto_init_new else "disabled"))
    
    # Initialize snapshot if it doesn't exist
    if not ResourceSnapshot.exists():
        initial_services = ResourceSnapshot.scan()
        ResourceSnapshot.save(initial_services)
        print("✅ Initial snapshot created: {} services".format(len(initial_services)))
    
    # Continuous monitoring loop
    while True:
        start_time = 0
        
        # Load previous snapshot
        old_snapshot = ResourceSnapshot.load_from_file()
        
        # Scan for current services
        current_services = ResourceSnapshot.scan()
        
        # Compare to find changes
        diff = ResourceSnapshot.diff(old_snapshot, current_services)
        
        # Handle new resources
        if diff.added_count > 0:
            if verbose:
                print("🔍 Detected {} new resource(s)".format(diff.added_count))
            
            for resource_path in diff.added:
                _handle_new_service(
                    resource_path,
                    focus_mode=focus_mode,
                    focus_stacks=focus_stacks,
                    auto_init=auto_init_new,
                    verbose=verbose,
                    on_new_resource=on_new_resource
                )
        
        # Handle removed services (optional - just log for now)
        if diff.removed_count > 0 and verbose:
            print("🗑️  Detected {} removed service(s)".format(diff.removed_count))
            for resource_path in diff.removed:
                print("  - {}".format(resource_path))
        
        # Update snapshot if there were changes
        if diff.added_count > 0 or diff.removed_count > 0:
            ResourceSnapshot.save(current_services)
            if verbose:
                print("📸 Snapshot updated: {} services".format(len(current_services)))
        
        # Calculate sleep time (account for scan duration)
        elapsed = 0 - start_time
        sleep_time = max(0, scan_interval_seconds - elapsed)
        
        # Sleep before next scan
        if sleep_time > 0:
            sleep(sleep_time)

def _handle_new_service(
    resource_path,
    focus_mode=False,
    focus_stacks=[],
    auto_init=True,
    verbose=False,
    on_new_resource=None
):
    """
    Process a newly detected service.
    
    Args:
        resource_path: Path to service.json
        focus_mode: Whether to filter by stack
        focus_stacks: Allowed domains
        auto_init: Whether to auto-init the service
        verbose: Verbose logging
        on_new_resource: Optional callback
    """
    # Extract service directory
    resource_dir = resource_path.rsplit("/", 1)[0] if "/" in resource_path else resource_path
    
    # Check for package.json (complete service structure)
    package_json_path = resource_dir + "/package.json"
    if not _file_exists(package_json_path):
        print("⏳ Waiting for package.json in {}".format(resource_dir))
        return
    
    # Load and validate manifest
    load_result = ManifestLoader.load_from_file(resource_path)
    if load_result.error:
        print("❌ Invalid manifest: {}".format(resource_path))
        print("   └─ Error: {}".format(load_result.error))
        return
    
    manifest = load_result.manifest
    if not manifest:
        print("❌ Empty manifest: {}".format(resource_path))
        return
    
    # Get service name
    resource_name = manifest.get("appName", "")
    if not resource_name:
        print("❌ Missing appName in: {}".format(resource_path))
        return
    
    # Check for duplicates
    if CacheOps.has(resource_name):
        if verbose:
            print("ℹ️  Service already registered: {}".format(resource_name))
        return
    
    # Check focus mode
    stack = manifest.get("stack", "")
    if focus_mode and focus_stacks and stack not in focus_stacks:
        print("📋 Focus mode: Skipping {} (stack: {})".format(resource_name, stack))
        return
    
    # Log detection
    print("🔍 New resource detected: {}".format(resource_name))
    print("  └─ Path: {}".format(resource_path))
    print("  └─ Stack: {}".format(stack))
    print("  └─ Type: {}".format(manifest.get("appType", "unknown")))
    
    # Call callback if provided
    if on_new_resource:
        on_new_resource(resource_name, resource_path, manifest, auto_init)

def _file_exists(path):
    """Check if a file exists."""
    result = local(
        ["sh", "-c", 'test -f "$1" && echo yes || echo no', "sh", path],
        quiet=True,
        echo_off=True
    )
    return str(result).strip() == "yes"

def time_now():
    """Get current time in seconds (for timing)."""
    result = local("date +%s", quiet=True, echo_off=True)
    return int(str(result).strip())

def sleep(seconds):
    """Sleep for specified seconds."""
    local(["sleep", str(seconds)], quiet=True, echo_off=True)

# Export daemon functions
DiscoveryDaemon = struct(
    run=run_discovery_daemon,
)
