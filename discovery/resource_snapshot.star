# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📸 RESOURCE SNAPSHOT - Starlark Interface
# =============================================================================
# Provides Starlark functions for snapshot-based incremental resource discovery
# =============================================================================

# Python script path (relative to Tiltfile)
_SNAPSHOT_SCRIPT = ".tdk/.tdk-out/snapshots/resource_snapshot.py"

def _run_snapshot_command(cmd):
    """Run a snapshot command via Python script."""
    result = local(
        "python3 " + _SNAPSHOT_SCRIPT + " " + cmd,
        quiet=True,
        echo_off=True
    )
    return str(result)

def save_snapshot(resources):
    """
    Save current resource list to snapshot file.
    
    Args:
        resources: List of service.json file paths
    """
    # Use Python to save snapshot directly
    result = local(
        "cd " + config.main_dir + " && python3 " + _SNAPSHOT_SCRIPT + " save",
        quiet=True,
        echo_off=True
    )
    
    return str(result)

def load_from_file():
    """
    Load previous snapshot from file.
    
    Returns:
        Dict with 'timestamp', 'resources', 'count'
    """
    result = _run_snapshot_command("load")
    
    # Parse JSON result
    if result and result.strip():
        # In Starlark, we can't use try/except, so we just try to decode
        parsed = decode_json(result)
        if parsed:
            return parsed
    
    # Return empty snapshot on error
    return {
        "timestamp": None,
        "services": [],
        "count": 0
    }

def diff_snapshots(old_snapshot, current_resources):
    """
    Compare old snapshot with current resources.
    
    Args:
        old_snapshot: Previous snapshot dict
        current_resources: Current list of resource paths
    
    Returns:
        Struct with 'added' and 'removed' lists
    """
    old_set = {}
    for resource in old_snapshot.get("resources", []):
        old_set[resource] = True
    
    current_set = {}
    for resource in current_resources:
        current_set[resource] = True
    
    # Find added resources
    added = []
    for resource in current_resources:
        if resource not in old_set:
            added.append(resource)
    
    # Find removed resources
    removed = []
    for resource in old_snapshot.get("resources", []):
        if resource not in current_set:
            removed.append(resource)
    
    return struct(
        added=added,
        removed=removed,
        added_count=len(added),
        removed_count=len(removed)
    )

def get_current_resources(scan_roots=["services/product"]):
    """
    Scan filesystem for current service.json files.
    
    Args:
        scan_roots: List of root directories to scan
    
    Returns:
        List of service.json file paths (relative to project root)
    """
    all_resources = []
    
    for root in scan_roots:
        # Use find command to locate service.json files
        cmd = "find " + root + " -type f -name 'service.json' 2>/dev/null | sort"
        result = local(cmd, quiet=True, echo_off=True)
        
        if result:
            lines = str(result).strip().split("\n")
            for line in lines:
                line = line.strip()
                if line:
                    all_resources.append(line)
    
    return all_resources

def snapshot_exists():
    """Check if snapshot file exists."""
    result = local(
        "test -f .tdk/.tdk-out/snapshots/resource-snapshot.json && echo 'yes' || echo 'no'",
        quiet=True,
        echo_off=True
    )
    return str(result).strip() == "yes"

# Get the path to the resource snapshot file
def get_resource_snapshot_path():
    """Return the path to the resource snapshot JSON file."""
    return ".tdk/.tdk-out/snapshots/resource-snapshot.json"

# Export public API
ResourceSnapshot = struct(
    save=save_snapshot,
    load_from_file=load_from_file,
    diff=diff_snapshots,
    scan=get_current_resources,
    exists=snapshot_exists,
)
