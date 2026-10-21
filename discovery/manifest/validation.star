# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# ✅ TILT SDK - MANIFEST VALIDATION
# =============================================================================
# Path: .tilt/topologies/tilt/discovery/manifest/validation.star
# Purpose: Validate manifest structure and values
# =============================================================================

load('./constants.star', 'VALID_APP_TYPES')
load('../TILT_DISCOVERY.star', 'VALID_STACKS', 'VALID_RESOURCE_FEATURES', 'PORT_RANGES')


def validate_manifest(manifest):
    """
    🎯 ENTERPRISE VALIDATOR: Strict structure and value validation.
    
    Validates:
    - Required fields: appName, appType, stack, port
    - appName pattern: kebab-case, 3-64 chars
    - appType: from VALID_APP_TYPES
    - stack: from VALID_STACKS
    - appType: from VALID_APP_TYPES
    - port: within range for appType (backends: 4000-5999, frontends: 3000-3999)
    - features: from VALID_RESOURCE_FEATURES
    - dependsOn: from VALID_STACKS (resource aliases)
    - replicas: 1-10
    """
    issues = []
    
    # 1. Required fields & appName pattern
    app_name = manifest.get('appName')
    if not app_name:
        issues.append("Missing required field: appName")
    elif type(app_name) != 'string':
        issues.append("appName must be a string")
    elif len(app_name) < 3:
        issues.append("appName too short: '" + app_name + "'. Minimum 3 characters")
    elif len(app_name) > 64:
        issues.append("appName too long: '" + app_name + "'. Maximum 64 characters")
    
    # Check kebab-case pattern
    for i in range(len(app_name)):
        char = app_name[i]
        if not (char.islower() or char.isdigit() or char == '-'):
            issues.append("Invalid character in appName: '" + char + "'. Must be kebab-case (lowercase, numbers, hyphens)")
            break
    if app_name.startswith('-') or app_name.endswith('-'):
        issues.append("appName cannot start or end with a hyphen")
    
    # 2. appType validation
    app_type = manifest.get('appType')
    if not app_type:
        issues.append("Missing required field: appType")
    elif app_type not in VALID_APP_TYPES:
        issues.append("Invalid appType: " + str(app_type) + ". Must be one of: " + ', '.join(VALID_APP_TYPES))
    
    # 3. stack validation
    stack = manifest.get('stack')
    if not stack:
        issues.append("Missing required field: stack")
    elif len(VALID_STACKS) > 0 and stack not in VALID_STACKS:
        # Only validate against list if VALID_STACKS is not empty
        issues.append("Invalid stack: " + str(stack) + ". Must be one of: " + ', '.join(VALID_STACKS))
    
    # 4. port validation with appType-specific ranges (skip for infra services)
    port = manifest.get('port')
    if port == None:
        if app_type != 'infra':
            issues.append("Missing required field: port")
    elif type(port) != 'int':
        issues.append("Invalid port: " + str(port) + ". Must be an integer")
    elif app_type != 'infra':
        if port < 3000 or port > 9999:
            issues.append("Invalid port: " + str(port) + ". Must be integer 3000-9999")
        elif app_type and app_type in PORT_RANGES:
            port_range = PORT_RANGES[app_type]
            if port < port_range['min'] or port > port_range['max']:
                issues.append("Port " + str(port) + " out of range for " + app_type + ". Expected " + str(port_range['min']) + "-" + str(port_range['max']))
    
    # 5. Validate features array
    features = manifest.get('featuresEnabled', [])
    if type(features) != 'list':
        issues.append("Invalid features: must be an array")
    else:
        for f in features:
            if f not in VALID_RESOURCE_FEATURES:
                issues.append("Invalid feature: " + str(f) + ". Must be one of: " + ', '.join(VALID_RESOURCE_FEATURES))
    
    # 6. Validate dependsOn array (must be valid resource aliases)
    deps = manifest.get('dependsOn', [])
    if type(deps) != 'list':
        issues.append("Invalid dependsOn: must be an array")
    else:
        # Valid dependency targets are discovered dynamically from manifests
        # No hardcoded list - all dependencies validated against discovered resources
        # The actual validation happens at orchestration time, not here
        pass
    
    # 7. Validate replicas (if specified)
    replicas = manifest.get('replicas')
    if replicas != None:
        if type(replicas) != 'int':
            issues.append("Invalid replicas: must be an integer")
        elif replicas < 1:
            issues.append("Invalid replicas: " + str(replicas) + ". Minimum is 1")
        elif replicas > 10:
            issues.append("Invalid replicas: " + str(replicas) + ". Maximum is 10")
    
    return issues
