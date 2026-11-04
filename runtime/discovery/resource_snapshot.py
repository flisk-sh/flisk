#!/usr/bin/env python3
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Service Snapshot Utility

Manages the snapshot file used for incremental service discovery.
The snapshot tracks which services have been discovered to detect
new services added while Tilt is running.
"""

import json
import os
import sys
import hashlib
import logging
from pathlib import Path
from typing import List, Dict, Set, Tuple, Optional
from datetime import datetime, timezone

# Configure logging
logging.basicConfig(level=logging.WARNING, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

SNAPSHOT_FILE = Path(".flisk/.flisk-out/snapshots/resource-snapshot.json")


def compute_resource_hash(resource_path: str) -> Optional[str]:
    """
    Compute MD5 hash of a service.json file for efficient change detection.
    
    Args:
        resource_path: Path to service.json file
    
    Returns:
        MD5 hash string or None if file cannot be read
    """
    try:
        with open(resource_path, 'rb') as f:
            content = f.read()
            return hashlib.md5(content).hexdigest()[:16]  # First 16 chars sufficient
    except (IOError, OSError) as e:
        logger.warning(f"Could not compute hash for {resource_path}: {e}")
        return None


def compute_services_hash(services: List[str]) -> str:
    """
    Compute aggregate hash of all services for quick comparison.
    
    Args:
        services: List of service paths
    
    Returns:
        Aggregate hash string
    """
    hasher = hashlib.md5()
    for svc in sorted(services):
        hasher.update(svc.encode())
        svc_hash = compute_resource_hash(svc)
        if svc_hash:
            hasher.update(svc_hash.encode())
    return hasher.hexdigest()[:16]


def save_snapshot(services: List[str], include_hashes: bool = True) -> None:
    """
    Save current service paths to snapshot file.
    
    Args:
        services: List of service.json file paths
        include_hashes: Whether to include content hashes for efficient comparison
    """
    snapshot = {
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        "services": sorted(services),
        "count": len(services)
    }
    
    # Include aggregate hash for quick comparison
    if services:
        snapshot["hash"] = compute_services_hash(services)
    
    # Include individual service hashes for change detection
    if include_hashes and services:
        resource_hashes = {}
        for svc in services:
            svc_hash = compute_resource_hash(svc)
            if svc_hash:
                resource_hashes[svc] = svc_hash
        snapshot["resource_hashes"] = resource_hashes
    
    # Ensure directory exists
    SNAPSHOT_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    with open(SNAPSHOT_FILE, 'w') as f:
        json.dump(snapshot, f, indent=2)


def load_snapshot() -> Dict:
    """
    Load previous snapshot from file.
    
    Returns:
        Snapshot dict with 'timestamp', 'services', 'count'.
        Returns empty snapshot if file doesn't exist.
    """
    if not SNAPSHOT_FILE.exists():
        return {
            "timestamp": None,
            "services": [],
            "count": 0
        }
    
    try:
        with open(SNAPSHOT_FILE, 'r') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        logger.warning(f"Corrupted snapshot file {SNAPSHOT_FILE}: {e}")
        return {
            "timestamp": None,
            "services": [],
            "count": 0
        }
    except IOError as e:
        logger.warning(f"Could not read snapshot file {SNAPSHOT_FILE}: {e}")
        return {
            "timestamp": None,
            "services": [],
            "count": 0
        }


def diff_snapshots(old: Dict, new: List[str], use_hashes: bool = True) -> Tuple[Set[str], Set[str], Set[str]]:
    """
    Compare old snapshot with current services to find changes.
    
    Uses hash-based comparison for efficient change detection when enabled.
    Returns services that changed content even if path stayed the same.
    
    Args:
        old: Previous snapshot dict
        new: Current list of service paths
        use_hashes: Whether to use hash-based comparison for efficiency
    
    Returns:
        Tuple of (added_services, removed_services, modified_services) as sets
    """
    old_services = set(old.get("services", []))
    new_services = set(new)
    
    added = new_services - old_services
    removed = old_services - new_services
    modified = set()
    
    # Quick hash-based check - if aggregate hash matches, no changes
    if use_hashes and "hash" in old and new:
        current_hash = compute_services_hash(new)
        if old["hash"] == current_hash:
            return set(), set(), set()  # No changes at all
    
    # Check for modified services (same path, different content)
    if use_hashes and "resource_hashes" in old:
        old_hashes = old["resource_hashes"]
        for svc in new_services & old_services:  # Intersection - services in both
            old_hash = old_hashes.get(svc)
            new_hash = compute_resource_hash(svc)
            if old_hash and new_hash and old_hash != new_hash:
                modified.add(svc)
    
    return added, removed, modified


def find_project_root(start: Optional[str] = None) -> Path:
    """The Flisk project this process belongs to.

    Tilt starts the daemon from `.flisk/.flisk-out` (the Tiltfile's directory), so a path relative to the working directory
    pointed into `.flisk-out` instead of the project: the snapshot landed in `.flisk-out/.flisk/.flisk-out/snapshots/`, which
    nothing watches, and the scan looked for `services/product` there and found nothing. A new service.json therefore never
    reloaded the Tiltfile. The root is FLISK_PROJECT_ROOT when set, else the nearest parent holding `.flisk/project.json`.
    """
    env_root = os.environ.get("FLISK_PROJECT_ROOT", "")
    if env_root and Path(env_root).is_dir():
        return Path(env_root)
    here = Path(start or os.getcwd()).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / ".flisk" / "project.json").is_file():
            return candidate
    return here


def discovery_scan_roots() -> List[str]:
    """Directories to scan for service.json, from `discovery.paths` in .flisk/project.json (globs like `services/*/*`)."""
    patterns: List[str] = []
    try:
        with open(Path(".flisk") / "project.json", "r") as f:
            configured = json.load(f).get("discovery", {}).get("paths", [])
        patterns = [p for p in configured if isinstance(p, str)]
    except (IOError, OSError, ValueError, AttributeError):
        patterns = []
    if not patterns:
        return ["services/product"]
    import glob
    roots: List[str] = []
    for pattern in patterns:
        matches = sorted(m for m in glob.glob(pattern) if os.path.isdir(m))
        roots.extend(matches if matches else [])
    # A pattern with no match yet (an empty project) still has to be rescanned: keep its literal prefix.
    if not roots:
        roots = [patterns[0].split("*")[0].rstrip("/") or "services"]
    return roots


def get_current_services(scan_root: Optional[str] = None) -> List[str]:
    """
    Scan filesystem for current service.json files.

    Args:
        scan_root: Root directory to scan. Default: every `discovery.paths` entry of the project, or services/product

    Returns:
        List of service.json file paths
    """
    import subprocess

    roots = [scan_root] if scan_root else discovery_scan_roots()
    found: List[str] = []
    for root in roots:
        if not os.path.isdir(root):
            continue
        try:
            result = subprocess.run(
                # -prune stops find from walking into node_modules and .autogenerated at all; `-not -path` only hides their
                # files, and a large node_modules can exceed the timeout and drop the whole root from the result.
                ["find", root, "(", "-name", "node_modules", "-o", "-name", ".autogenerated", ")", "-prune",
                 "-o", "-type", "f", "-name", "service.json", "-print"],
                capture_output=True,
                text=True,
                timeout=5
            )

            if result.returncode == 0:
                found.extend(line.strip() for line in result.stdout.split('\n') if line.strip())
        except subprocess.TimeoutExpired:
            logger.warning(f"Service scan timed out for {root}")
        except subprocess.SubprocessError as e:
            logger.warning(f"Service scan failed for {root}: {e}")

    return sorted(set(found))


def main():
    """CLI interface for snapshot operations."""
    if len(sys.argv) < 2:
        print("Usage: resource_snapshot.py <command> [args]")
        print("Commands:")
        print("  save              - Save current service snapshot")
        print("  load              - Load and display snapshot")
        print("  diff              - Compare current state with snapshot (uses hash-based comparison)")
        print("  scan              - Scan for services without saving")
        print("  profile           - Profile performance and resource usage (Task 10.5)")
        print("  watch [interval]  - Continuous monitoring with hash-based change detection")
        print()
        print("Examples:")
        print("  python3 resource_snapshot.py scan")
        print("  python3 resource_snapshot.py diff")
        print("  python3 resource_snapshot.py profile")
        print("  python3 resource_snapshot.py watch 5")
        return
    
    command = sys.argv[1]

    # Paths below (the snapshot file, the services) are relative to the project, whatever directory Tilt started us in.
    os.chdir(find_project_root())

    # Tilt reads our output through a pipe, where Python buffers it: without this "Changes detected" shows up minutes late.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)

    if command == "save":
        services = get_current_services()
        save_snapshot(services)
        print(f"✅ Snapshot saved: {len(services)} services")
        
    elif command == "load":
        snapshot = load_snapshot()
        print(json.dumps(snapshot, indent=2))
        
    elif command == "diff":
        import time
        start = time.time()
        
        old = load_snapshot()
        new = get_current_services()
        added, removed, modified = diff_snapshots(old, new, use_hashes=True)
        
        elapsed = (time.time() - start) * 1000  # Convert to ms
        
        print(f"📊 Snapshot diff (computed in {elapsed:.1f}ms):")
        print(f"  Previous: {old.get('count', 0)} services")
        print(f"  Current:  {len(new)} services")
        print(f"  Added:    {len(added)}")
        print(f"  Removed:  {len(removed)}")
        print(f"  Modified: {len(modified)}")
        
        if added:
            print("\n  New services:")
            for svc in sorted(added):
                print(f"    + {svc}")
        
        if removed:
            print("\n  Removed services:")
            for svc in sorted(removed):
                print(f"    - {svc}")
        
        if modified:
            print("\n  Modified services (content changed):")
            for svc in sorted(modified):
                print(f"    ~ {svc}")
        
        print(f"\n  ⚡ Hash-based comparison: enabled")
        if old.get('hash'):
            print(f"  🔐 Aggregate hash: {old['hash'][:8]}...")
                
    elif command == "scan":
        services = get_current_services()
        print(f"🔍 Found {len(services)} services:")
        for svc in services:
            print(f"  - {svc}")
    
    elif command == "profile":
        """Profile resource usage and performance metrics."""
        import time
        import resource
        
        print("🔬 Profiling snapshot operations...")
        print()
        
        # Memory baseline
        baseline_mem = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024  # KB to MB
        
        # Time the scan operation
        start = time.time()
        services = get_current_services()
        scan_time = (time.time() - start) * 1000
        
        # Time hash computation
        start = time.time()
        if services:
            svc_hash = compute_services_hash(services)
        hash_time = (time.time() - start) * 1000 if services else 0
        
        # Time snapshot save
        start = time.time()
        save_snapshot(services, include_hashes=True)
        save_time = (time.time() - start) * 1000
        
        # Memory after operations
        final_mem = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
        memory_used = final_mem - baseline_mem
        
        print("📊 Performance Profile:")
        print(f"  Services scanned:     {len(services)}")
        print(f"  Scan time:            {scan_time:.2f}ms")
        print(f"  Hash computation:     {hash_time:.2f}ms")
        print(f"  Snapshot save:        {save_time:.2f}ms")
        print(f"  Total time:           {scan_time + hash_time + save_time:.2f}ms")
        print(f"  Memory used:          {memory_used:.2f} MB")
        print()
        
        # Performance targets
        print("🎯 Performance Targets:")
        print(f"  Scan < 500ms:         {'✅ PASS' if scan_time < 500 else '⚠️  FAIL'}")
        print(f"  Memory < 10MB:        {'✅ PASS' if memory_used < 10 else '⚠️  FAIL'}")
        print()
        
        if services:
            print(f"🔐 Aggregate hash: {svc_hash[:16]}...")
        
    elif command == "watch":
        """Continuous monitoring mode for daemon operation."""
        import time
        
        scan_interval = int(sys.argv[2]) if len(sys.argv) > 2 else 5
        
        print(f"👁️  Starting continuous monitoring (interval: {scan_interval}s)")
        print("   Press Ctrl+C to stop")
        print()
        
        # Initialize snapshot if needed
        if not SNAPSHOT_FILE.exists():
            services = get_current_services()
            save_snapshot(services)
            print(f"✅ Initial snapshot: {len(services)} services")
        
        try:
            while True:
                old = load_snapshot()
                current = get_current_services()
                added, removed, modified = diff_snapshots(old, current, use_hashes=True)
                
                if added or removed or modified:
                    print(f"🔍 Changes detected at {datetime.now(timezone.utc).strftime('%H:%M:%S')}:")
                    if added:
                        print(f"   + {len(added)} new service(s)")
                        for svc in added:
                            print(f"     + {svc}")
                    if removed:
                        print(f"   - {len(removed)} removed service(s)")
                        for svc in removed:
                            print(f"     - {svc}")
                    if modified:
                        print(f"   ~ {len(modified)} modified service(s)")
                        for svc in modified:
                            print(f"     ~ {svc}")
                    
                    # Update snapshot
                    save_snapshot(current)
                    print(f"✅ Snapshot updated: {len(current)} services")
                
                time.sleep(scan_interval)
                
        except KeyboardInterrupt:
            print("\n👋 Monitoring stopped")
    
    else:
        print(f"Unknown command: {command}")
        print("\nAvailable commands:")
        print("  save       - Save current snapshot")
        print("  load       - Load and display snapshot")
        print("  diff       - Compare current state with snapshot")
        print("  scan       - Scan for services without saving")
        print("  profile    - Profile performance and resource usage")
        print("  watch [N]  - Continuous monitoring with N-second interval (default: 5)")


if __name__ == "__main__":
    main()
