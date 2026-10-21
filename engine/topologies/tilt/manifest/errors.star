# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📋 MANIFEST MODULE - ERROR HANDLING
# =============================================================================
# Path: .tilt/topologies/tilt/manifest/errors.star
# Purpose: Standardized error types and handling for manifest system
# Status: Phase 1 of manifest system refactoring
# =============================================================================

# Error severity levels
SEVERITY = {
    'CRITICAL': 'critical',  # Must fix, system won't function
    'ERROR': 'error',        # Should fix, may cause issues
    'WARNING': 'warning',    # Should consider, non-blocking
    'INFO': 'info',          # Informational only
    'DEPRECATION': 'deprecation',  # Feature will be removed
}

# Error categories
CATEGORY = {
    'SCHEMA': 'schema',           # Schema violations
    'VALIDATION': 'validation',     # Value validation failures
    'IO': 'io',                   # File I/O errors
    'PARSE': 'parse',             # JSON parsing errors
    'DEPENDENCY': 'dependency',   # Service dependency issues
    'CONFIG': 'config',           # Configuration errors
    'RUNTIME': 'runtime',         # Runtime errors
    'NETWORK': 'network',         # Network/remote fetch errors
}

# Common error messages
ERROR_MESSAGES = {
    'MISSING_REQUIRED_FIELD': 'Missing required field: {field}',
    'INVALID_FIELD_TYPE': 'Field {field} has invalid type: expected {expected}, got {actual}',
    'INVALID_FIELD_VALUE': 'Field {field} has invalid value: {value}',
    'FIELD_OUT_OF_RANGE': 'Field {field} value {value} is outside valid range [{min}, {max}]',
    'INVALID_PATTERN': 'Field {field} value does not match required pattern: {pattern}',
    'INVALID_ENUM': 'Field {field} value {value} is not in allowed values: {allowed}',
    'FILE_NOT_FOUND': 'Manifest file not found: {path}',
    'FILE_EMPTY': 'Manifest file is empty: {path}',
    'INVALID_JSON': 'Invalid JSON in manifest file: {path} - {error}',
    'DEPENDENCY_NOT_FOUND': 'Dependency {dependency} not found for service {service}',
    'CIRCULAR_DEPENDENCY': 'Circular dependency detected: {path}',
    'PORT_CONFLICT': 'Port {port} is already used by service {existing_service}',
    'DUPLICATE_RESOURCE_NAME': 'Duplicate service name: {name}',
    'INVALID_APP_TYPE': 'Invalid app type {appType} for service {service}',
    'MISSING_BACKEND': 'Frontend {service} is missing backendName field',
    'MISSING_DATABASE': 'Service {service} has prisma feature but no databaseName',
}

def new_error(message, category, severity, context=None):
    """
    Create a standardized error struct.
    
    Args:
        message: Human-readable error message
        category: Error category (from CATEGORY)
        severity: Error severity (from SEVERITY)
        context: Optional dict with:
            - field: Field name if field-specific
            - path: File path
            - value: Invalid value
            - expected: Expected value/type
            - suggestion: Suggested fix
    
    Returns:
        Error struct
    """
    return struct(
        message=message,
        category=category,
        severity=severity,
        context=context or {},
        timestamp=None,  # Tilt doesn't have time functions, set externally if needed
    )

def format_error(error):
    """
    Format error for display.
    
    Args:
        error: Error struct
    
    Returns:
        Formatted string
    """
    base = "[{severity}] {category}: {message}".format(
        severity=error.severity.upper(),
        category=error.category.upper(),
        message=error.message,
    )
    
    if error.context:
        if 'field' in error.context:
            base += " (field: {field})".format(field=error.context['field'])
        if 'path' in error.context:
            base += " @ {path}".format(path=error.context['path'])
        if 'suggestion' in error.context:
            base += "\n  💡 Suggestion: {suggestion}".format(
                suggestion=error.context['suggestion']
            )
    
    return base

def group_errors(errors):
    """
    Group errors by category and severity.
    
    Args:
        errors: List of error structs
    
    Returns:
        Dict with errors grouped by category and severity
    """
    grouped = {}
    
    for error in errors:
        cat = error.category
        sev = error.severity
        
        if cat not in grouped:
            grouped[cat] = {}
        
        if sev not in grouped[cat]:
            grouped[cat][sev] = []
        
        grouped[cat][sev].append(error)
    
    return grouped

def has_critical_errors(errors):
    """
    Check if any critical errors exist.
    
    Args:
        errors: List of error structs
    
    Returns:
        True if any critical errors exist
    """
    for error in errors:
        if error.severity == SEVERITY['CRITICAL']:
            return True
    return False

def has_errors(errors, min_severity='ERROR'):
    """
    Check if any errors of specified severity or higher exist.
    
    Args:
        errors: List of error structs
        min_severity: Minimum severity to check (ERROR, WARNING, etc.)
    
    Returns:
        True if any matching errors exist
    """
    severity_order = ['INFO', 'DEPRECATION', 'WARNING', 'ERROR', 'CRITICAL']
    min_idx = severity_order.index(min_severity)
    
    for error in errors:
        error_idx = severity_order.index(error.severity)
        if error_idx >= min_idx:
            return True
    
    return False

def filter_errors(errors, category=None, severity=None):
    """
    Filter errors by category and/or severity.
    
    Args:
        errors: List of error structs
        category: Optional category to filter by
        severity: Optional severity to filter by
    
    Returns:
        Filtered list of errors
    """
    filtered = []
    
    for error in errors:
        if category and error.category != category:
            continue
        if severity and error.severity != severity:
            continue
        filtered.append(error)
    
    return filtered

def get_error_summary(errors):
    """
    Get a summary of errors by category and severity.
    
    Args:
        errors: List of error structs
    
    Returns:
        Summary dict with counts
    """
    summary = {
        'total': len(errors),
        'by_severity': {
            'CRITICAL': 0,
            'ERROR': 0,
            'WARNING': 0,
            'INFO': 0,
            'DEPRECATION': 0,
        },
        'by_category': {},
    }
    
    for error in errors:
        summary['by_severity'][error.severity] += 1
        
        cat = error.category
        if cat not in summary['by_category']:
            summary['by_category'][cat] = 0
        summary['by_category'][cat] += 1
    
    return summary

def create_field_error(field_name, field_value, error_type, **kwargs):
    """
    Convenience function to create field-specific errors.
    
    Args:
        field_name: Name of the field with error
        field_value: The invalid value
        error_type: Type of error (key in ERROR_MESSAGES)
        **kwargs: Additional context for error message formatting
    
    Returns:
        Error struct
    """
    message_template = ERROR_MESSAGES.get(error_type, 'Unknown error for field {field}')
    
    context = {
        'field': field_name,
        'value': field_value,
    }
    context.update(kwargs)
    
    message = message_template.format(**context)
    
    return new_error(
        message=message,
        category=CATEGORY['VALIDATION'],
        severity=SEVERITY['ERROR'],
        context=context,
    )

# Export all error handling functions and constants
ManifestErrors = struct(
    SEVERITY=SEVERITY,
    CATEGORY=CATEGORY,
    ERROR_MESSAGES=ERROR_MESSAGES,
    new=new_error,
    format=format_error,
    group=group_errors,
    has_critical=has_critical_errors,
    has_errors=has_errors,
    filter=filter_errors,
    get_summary=get_error_summary,
    create_field_error=create_field_error,
)

VALIDATION = {}
