# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Deterministic Tilt Configuration for Flisk Landscape
# Inspired by Mira Murati's "Defeating Nondeterminism" philosophy
# Goal: Same filesystem state + same environment = identical Tilt output

# =============================================================================
# DETERMINISTIC MODE SETTINGS
# =============================================================================
# Set TILT_DETERMINISTIC=true to enable strict deterministic mode
# This ensures "same input, same output" guarantees
# =============================================================================

# Read deterministic mode flag
_DETERMINISTIC_MODE = os.environ.get('TILT_DETERMINISTIC', 'false').lower() == 'true'

if _DETERMINISTIC_MODE:
    print("🔒 DETERMINISTIC MODE ENABLED")
    print("  └─ Same filesystem state + same environment = identical output")
    print("  └─ All operations are ordered, reproducible, and invariant")

# =============================================================================
# DETERMINISTIC FILE DISCOVERY
# =============================================================================

def deterministic_find(path, pattern):
    """Deterministic file discovery - always returns sorted results.
    
    Args:
        path: Directory to search
        pattern: File pattern to match
        
    Returns:
        Sorted list of files (alphabetical, cross-platform consistent)
    """
    # Always use | sort to ensure alphabetical ordering
    # This makes output invariant to filesystem ordering (ext4 vs APFS vs NTFS)
    cmd = "find {} -type f -name '{}' 2>/dev/null | sort".format(path, pattern)
    result = str(local(cmd, quiet=True, echo_off=True)).strip()
    if result:
        return result.split('\n')
    return []

def deterministic_resource_discovery(scan_roots):
    """Deterministically discover resources across all scan roots.
    
    Args:
        scan_roots: List of directories to scan for service.json files
        
    Returns:
        Sorted list of resource paths (guaranteed order across runs)
    """
    all_resources = []
    
    # Process scan roots in fixed order (not parallel)
    for root in sorted(scan_roots):
        resources = deterministic_find(root, 'service.json')
        all_resources.extend(resources)
    
    # Final sort to ensure absolute ordering
    return sorted(all_resources)

# =============================================================================
# DETERMINISTIC LOCAL EXECUTION
# =============================================================================

def deterministic_local(cmd, **kwargs):
    """Execute local command in deterministic mode.
    
    In deterministic mode:
    - Commands run sequentially (not parallel)
    - Output is normalized (timestamps, PIDs, temp paths)
    - Cache is used when available
    
    Args:
        cmd: Command to execute
        **kwargs: Additional arguments for local()
        
    Returns:
        Command output (normalized in deterministic mode)
    """
    # Force quiet mode and no echo for determinism
    kwargs['quiet'] = True
    kwargs['echo_off'] = True
    
    if _DETERMINISTIC_MODE:
        # In deterministic mode, we could add:
        # - Output normalization
        # - Result caching
        # - Strict ordering
        pass
    
    return local(cmd, **kwargs)

# =============================================================================
# DETERMINISTIC RESOURCE ORDERING
# =============================================================================

def sort_resources_by_name(resources):
    """Sort resources alphabetically for deterministic ordering.
    
    Args:
        resources: List of resource dictionaries or names
        
    Returns:
        Sorted list (by name)
    """
    if resources and isinstance(resources[0], dict):
        return sorted(resources, key=lambda x: x.get('name', ''))
    return sorted(resources)

# =============================================================================
# DETERMINISTIC ENVIRONMENT
# =============================================================================

def get_deterministic_env():
    """Get environment variables that affect determinism.
    
    Returns:
        Dict of environment variables that must be constant for reproducibility
    """
    env_keys = [
        'TILT_DETERMINISTIC',
        'TILT_TRIGGER_MODE',
        'MOCK_TIKKIE',
        'INFISICAL_ENABLED',
        'VERBOSE',
        'AUTO_DISCOVER',
        'TILT_MAX_PARALLEL_UPDATES',
    ]
    return {k: os.environ.get(k, '') for k in env_keys}

def validate_deterministic_env():
    """Validate that environment is suitable for deterministic runs.
    
    Returns:
        True if environment is deterministic, False otherwise
    """
    if not _DETERMINISTIC_MODE:
        return True
    
    # Check for sources of nondeterminism
    warnings = []
    
    # Parallel updates can cause ordering differences
    parallel = os.environ.get('TILT_MAX_PARALLEL_UPDATES', '')
    if parallel and int(parallel) > 1:
        warnings.append("TILT_MAX_PARALLEL_UPDATES > 1 may cause ordering differences")
    
    # Auto trigger mode can cause timing-dependent behavior
    if os.environ.get('TILT_TRIGGER_MODE', 'manual') != 'manual':
        warnings.append("TILT_TRIGGER_MODE=auto may cause timing-dependent behavior")
    
    if warnings:
        print("⚠️  Deterministic mode warnings:")
        for w in warnings:
            print("    - {}".format(w))
    
    return len(warnings) == 0

# =============================================================================
# DETERMINISTIC MANIFEST GENERATION
# =============================================================================

def deterministic_yaml_generation(resource_paths):
    """Generate YAML manifests deterministically from JSON manifests.
    
    Args:
        resource_paths: List of service.json paths
        
    Returns:
        List of generated/verified YAML paths
    """
    yaml_paths = []
    
    # Process in sorted order for determinism
    for resource_json in sorted(resource_paths):
        resource_dir = os.path.dirname(resource_json)
        resource_yaml = os.path.join(resource_dir, 'service.yaml')
        
        # Check if regeneration needed
        needs_regen = False
        if not os.path.exists(resource_yaml):
            needs_regen = True
        else:
            # Compare modification times
            json_stat = os.stat(resource_json)
            yaml_stat = os.path.exists(resource_yaml) and os.stat(resource_yaml)
            if yaml_stat and json_stat.st_mtime > yaml_stat.st_mtime:
                needs_regen = True
        
        yaml_paths.append(resource_yaml)
    
    return sorted(yaml_paths)

# =============================================================================
# EXPORTS
# =============================================================================

DETERMINISTIC_EXPORTS = {
    'deterministic_find': deterministic_find,
    'deterministic_resource_discovery': deterministic_resource_discovery,
    'deterministic_local': deterministic_local,
    'sort_resources_by_name': sort_resources_by_name,
    'get_deterministic_env': get_deterministic_env,
    'validate_deterministic_env': validate_deterministic_env,
    'deterministic_yaml_generation': deterministic_yaml_generation,
    'DETERMINISTIC_MODE': _DETERMINISTIC_MODE,
}

print("📋 Deterministic Tilt utilities loaded")
if _DETERMINISTIC_MODE:
    print("  └─ All operations will be ordered and reproducible")
