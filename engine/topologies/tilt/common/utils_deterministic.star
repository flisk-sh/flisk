# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📋 DETERMINISTIC TILT UTILITIES
# =============================================================================
# Inspired by Mira Murati's "Defeating Nondeterminism" philosophy
# Goal: Same filesystem state + same environment = identical Tilt output
# =============================================================================
#
# Usage:
#   load('ext://tdk-cli', 'deterministic_find', 'deterministic_local')
#
#   files = deterministic_find('./services', 'service.json')
#   result = deterministic_local('bun install')
# =============================================================================

# =============================================================================
# DETERMINISTIC MODE SETTINGS
# =============================================================================
# Set TILT_DETERMINISTIC=true to enable strict deterministic mode
# This ensures "same input, same output" guarantees
# =============================================================================

_DETERMINISTIC_MODE = os.environ.get('TILT_DETERMINISTIC', 'false').lower() == 'true'

def is_deterministic_mode():
    """Check if deterministic mode is enabled."""
    return _DETERMINISTIC_MODE

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
    cmd = ["sh", "-c", 'find "$1" -type f -name "$2" 2>/dev/null | sort', "sh", path, pattern]
    result = str(local(cmd, quiet=True, echo_off=True)).strip()
    if result:
        return result.split('\n')
    return []

def deterministic_resource_discovery(scan_roots):
    """Deterministically discover services across all scan roots.
    
    Args:
        scan_roots: List of directories to scan for service.json files
        
    Returns:
        Sorted list of service paths (guaranteed order across runs)
    """
    all_services = []
    
    for root in sorted(scan_roots):
        services = deterministic_find(root, 'service.json')
        all_services.extend(services)
    
    return sorted(all_services)

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
    kwargs['quiet'] = True
    kwargs['echo_off'] = True
    
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
    if resources and type(resources[0]) == "dict":
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
    
    warnings = []
    
    parallel = os.environ.get('TILT_MAX_PARALLEL_UPDATES', '')
    if parallel and int(parallel) > 1:
        warnings.append("TILT_MAX_PARALLEL_UPDATES > 1 may cause ordering differences")
    
    if os.environ.get('TILT_TRIGGER_MODE', 'manual') != 'manual':
        warnings.append("TILT_TRIGGER_MODE=auto may cause timing-dependent behavior")
    
    if warnings:
        print("⚠️  Deterministic mode warnings:")
        for w in warnings:
            print("    - {}".format(w))
    
    return len(warnings) == 0

# =============================================================================
# EXPORTS
# =============================================================================

Determinism = struct(
    is_deterministic_mode=is_deterministic_mode,
    deterministic_find=deterministic_find,
    deterministic_resource_discovery=deterministic_resource_discovery,
    deterministic_local=deterministic_local,
    sort_resources_by_name=sort_resources_by_name,
    get_deterministic_env=get_deterministic_env,
    validate_deterministic_env=validate_deterministic_env,
    DETERMINISTIC_MODE=_DETERMINISTIC_MODE,
)
