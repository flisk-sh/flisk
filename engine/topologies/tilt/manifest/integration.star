# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📋 MANIFEST MODULE - DISCOVERY INTEGRATION (Phase 5 Complete)
# =============================================================================
# Path: .tilt/topologies/tilt/manifest/integration.star
# Purpose: Integration layer between new manifest module and discovery system
# Status: Phase 5 COMPLETE - Fully integrated, backward compatibility removed
# 
# This module provides the bridge between the new manifest system and the
# discovery infrastructure. Phase 5 complete - using new system exclusively.
# =============================================================================

load("./__init__.star", "Manifest")
load("./loader.star", "ManifestLoader")
load("./parser.star", "ManifestParser")
load("./validator.star", "ManifestValidator")
load("../resources/shared-platform-postgres.star", "SHARED_POSTGRES_DEPENDENCY_NAMES")

# Phase 5: Migration complete - always use new system
def load_and_validate_manifest(manifest_path, all_manifests=None):
    """
    Load and validate a manifest using the new manifest system.
    
    This is the main integration point for discovery.star to use
    the new manifest module. Phase 5: Always uses new system.
    
    Args:
        manifest_path: Path to manifest JSON file
        all_manifests: Optional list of all manifests for cross-validation
    
    Returns:
        struct(
            manifest=None,      # Normalized manifest dict
            error=None,         # Error message or None
            warnings=[],        # List of warnings
            validation=None,    # Validation result struct
            metadata={},        # Loading metadata
        )
    """
    
    if load_result.error:
        return struct(
            manifest=None,
            error=load_result.error,
            warnings=load_result.warnings,
            validation=None,
            metadata=load_result.metadata,
        )
    
    raw_manifest = load_result.manifest
    resource_path = ManifestParser.extract_resource_path(manifest_path)
    
    # Step 2: Parse and normalize
    parse_result = ManifestParser.get_normalized(raw_manifest, resource_path)
    
    if parse_result.error:
        return struct(
            manifest=None,
            error=parse_result.error,
            warnings=parse_result.warnings + load_result.warnings,
            validation=None,
            metadata=load_result.metadata,
        )
    
    normalized_manifest = parse_result.manifest
    all_warnings = parse_result.warnings + load_result.warnings
    
    # Step 3: Validate
    context = {'resource_path': resource_path}
    if all_manifests:
        context['all_manifests'] = all_manifests
    
    validation_result = ManifestValidator.validate(normalized_manifest, context, level='all')
    
    # Add validation warnings to list
    for warning in validation_result.warnings:
        all_warnings.append(Manifest.format_error(warning))
    
    return struct(
        manifest=normalized_manifest,
        error=None,
        warnings=all_warnings,
        validation=validation_result,
        metadata=load_result.metadata,
    )

def load_all_manifests(services_root, filters=None, validate=False):
    """
    Load all manifests with optional validation.
    
    Integration wrapper for Manifest.load_all() with additional
    processing for discovery system compatibility.
    
    Args:
        services_root: Root directory to search
        filters: Optional filters (appType, stack, features)
        validate: Whether to validate each manifest
    
    Returns:
        struct(
            manifests=[],       # List of normalized manifests
            errors=[],          # List of errors
            warnings=[],        # List of warnings
            stats={},           # Loading statistics
            by_name={},         # Dict mapping appName to manifest
            by_port={},         # Dict mapping port to manifest
        )
    """
    # Use the new loader
    load_result = ManifestLoader.load_all(services_root, filters)
    
    manifests = []
    errors = []
    warnings = []
    by_name = {}
    by_port = {}
    
    # Normalize each manifest
    for raw_manifest in load_result.manifests:
        resource_path = raw_manifest.get('_resource_path', '')
        
        # Normalize
        parse_result = ManifestParser.get_normalized(raw_manifest, resource_path)
        
        if parse_result.error:
            errors.append(parse_result.error)
            continue
        
        normalized = parse_result.manifest
        manifests.append(normalized)
        
        # Build lookup maps
        app_name = normalized.get('appName')
        if app_name:
            by_name[app_name] = normalized
        
        port = normalized.get('port')
        if port:
            by_port[port] = normalized
        
        # Collect warnings
        warnings.extend(parse_result.warnings)
    
    # Add loading errors
    for error in load_result.errors:
        errors.append(ManifestErrors.format(error))
    
    # Validate if requested
    if validate:
        for manifest in manifests:
            context = {
                'all_manifests': manifests,
                'resource_path': manifest.get('_resource_path', ''),
            }
            
            validation = ManifestValidator.validate(manifest, context, level='cross_service')
            
            if not validation.valid:
                for error in validation.errors:
                    errors.append(Manifest.format_error(error))
    
    return struct(
        manifests=manifests,
        errors=errors,
        warnings=warnings,
        stats=load_result.stats,
        by_name=by_name,
        by_port=by_port,
    )

def convert_to_resource_format(manifest):
    """
    Convert normalized manifest to discovery resource format.
    
    This ensures compatibility with the existing discovery system
    by converting the new manifest format to the expected resource format.
    
    Args:
        manifest: Normalized manifest dict
    
    Returns:
        Resource dict in discovery format
    """
    app_name = manifest.get('appName', 'unknown')
    app_type = manifest.get('appType', 'backend')
    stack = manifest.get('stack', 'unknown')
    port = manifest.get('port', 4000)
    syncs = manifest.get('syncs', [])
    dockerfile = manifest.get('dockerfile', '.autogenerated/Dockerfile.app.autogenerated')
    resource_path = manifest.get('_resource_path', '')

    resource = {
        'name': app_name,
        'dockerfile': app_name + '/' + dockerfile,
        'syncs': syncs,
        'port': port,
        'stack': stack,
        '_manifest': manifest.get('_manifest', manifest),  # Original manifest
        '_resource_path': resource_path,
        '_normalized': True,
    }
    
    # Add frontend-specific fields
    if app_type == 'frontend':
        resource['frontend'] = True
        resource['backendName'] = manifest.get('backendName', app_name.replace('-frontend', '-backend'))
    
    # Add optional fields
    if manifest.get('target_path'):
        resource['target_path'] = manifest['target_path']
    if manifest.get('prisma_client_path'):
        resource['prisma_client_path'] = manifest['prisma_client_path']
    if manifest.get('registry_host'):
        resource['registry_host'] = manifest['registry_host']
    if manifest.get('start_command'):
        resource['start_command'] = manifest['start_command']
    
    return resource

def get_validation_summary(manifests):
    """
    Generate validation summary for all manifests.
    
    Args:
        manifests: List of manifest dicts
    
    Returns:
        Dict with summary statistics
    """
    summary = {
        'total': len(manifests),
        'valid': 0,
        'invalid': 0,
        'errors': 0,
        'warnings': 0,
        'by_severity': {
            'CRITICAL': 0,
            'ERROR': 0,
            'WARNING': 0,
        },
    }
    
    for manifest in manifests:
        context = {'all_manifests': manifests}
        result = ManifestValidator.validate(manifest, context, level='all')
        
        if result.valid:
            summary['valid'] += 1
        else:
            summary['invalid'] += 1
        
        summary['errors'] += len([e for e in result.errors 
                                  if e.severity in ['ERROR', 'CRITICAL']])
        summary['warnings'] += len(result.warnings)
        
        for error in result.errors:
            if error.severity in summary['by_severity']:
                summary['by_severity'][error.severity] += 1
    
    return summary

def check_port_conflicts(manifests):
    """
    Check for port conflicts across all manifests.
    
    Args:
        manifests: List of manifest dicts
    
    Returns:
        List of conflict error structs
    """
    conflicts = []
    ports = {}
    
    for manifest in manifests:
        port = manifest.get('port')
        app_name = manifest.get('appName', 'unknown')
        
        if port:
            if port in ports:
                conflicts.append(ManifestErrors.new(
                    message="Port {} conflict: {} and {}".format(port, ports[port], app_name),
                    category=ManifestErrors.CATEGORY['VALIDATION'],
                    severity=ManifestErrors.SEVERITY['ERROR'],
                    context={'port': port, 'services': [ports[port], app_name]},
                ))
            else:
                ports[port] = app_name
    
    return conflicts

def check_dependencies_valid(manifests):
    """
    Check if all dependencies reference valid services.

    Shared platform Postgres names (`postgres`, `database-management`) are not
    app services; they resolve to the Tilt resource `postgres` and are not
    reported as missing.

    Args:
        manifests: List of manifest dicts

    Returns:
        List of dependency error structs
    """
    errors = []
    app_names = {m.get('appName'): m for m in manifests if m.get('appName')}

    for manifest in manifests:
        app_name = manifest.get('appName', 'unknown')
        internal_deps = manifest.get('dependsOn', [])

        for dep in internal_deps:
            if dep in SHARED_POSTGRES_DEPENDENCY_NAMES:
                continue
            if dep not in app_names:
                errors.append(ManifestErrors.new(
                    message="Service '{}' depends on non-existent service '{}'".format(app_name, dep),
                    category=ManifestErrors.CATEGORY['DEPENDENCY'],
                    severity=ManifestErrors.SEVERITY['ERROR'],
                    context={'service': app_name, 'dependency': dep},
                ))
        
        # Check frontend backend references
        if manifest.get('appType') == 'frontend':
            backend_name = manifest.get('backendName', '')
            if backend_name and backend_name not in app_names:
                errors.append(ManifestErrors.new(
                    message="Frontend '{}' references non-existent backend '{}'".format(app_name, backend_name),
                    category=ManifestErrors.CATEGORY['DEPENDENCY'],
                    severity=ManifestErrors.SEVERITY['ERROR'],
                    context={'frontend': app_name, 'backend': backend_name},
                ))
    
    return errors

# Export integration functions
ManifestIntegration = struct(
    load_and_validate=load_and_validate_manifest,
    load_all=load_all_manifests,
    convert_to_resource=convert_to_resource_format,
    get_validation_summary=get_validation_summary,
    check_port_conflicts=check_port_conflicts,
    check_dependencies_valid=check_dependencies_valid,
)

VALIDATION = {}
