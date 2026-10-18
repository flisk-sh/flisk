# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📋 MANIFEST MODULE - VALIDATOR
# =============================================================================
# Path: .tilt/topologies/tilt/manifest/validator.star
# Purpose: Comprehensive manifest validation with schema, values, and dependencies
# Status: Phase 3 of manifest system refactoring
# =============================================================================

# === INLINED CONSTANTS for pure extension loading ===
VALID_STACKS = ()  # Stacks are project-specific, discovered dynamically
VALID_FEATURES = "api-client", "env-config", "api-index", "prisma", "drizzle", "ddd", "nats", "redis", "infisical", "vitest", "traefik", "websocket", "graphql", "grpc", "vite-node", "maintenance", "sablier"
PORT_RANGES = {"frontend": {"min": 3000, "max": 5999}, "backend": {"min": 4000, "max": 5999}, "bring-your-own": {"min": 4000, "max": 5999}, "worker": {"min": 6000, "max": 6999}, "migrator": {"min": 7000, "max": 7999}, "sdk": {"min": 3000, "max": 9999}, "library": {"min": 3000, "max": 9999}}
DEFAULTS = {}

# === END INLINED CONSTANTS ===


load("./constants.star",
    "VALID_APP_TYPES",
    "MANIFEST_DEFAULTS",
    "VALIDATION_THRESHOLDS",
    "MANIFEST_FILENAME",
)

load("./schema.star", "ManifestSchema")
load("./errors.star", "ManifestErrors")
load("./parser.star", "extract_stack_from_path")
load("../resources/shared-platform-postgres.star", "is_shared_platform_postgres_dependency")

def validate(manifest, context=None, level='all'):
    """
    Comprehensive manifest validation at specified level.
    
    Args:
        manifest: Manifest dict to validate
        context: Optional context dict:
            - all_manifests: List of all manifests for cross-validation
            - resource_path: Path for error context
            - strict: Boolean for strict mode (treats warnings as errors)
        level: Validation level
            - 'schema': Structure and types only
            - 'values': Value constraints
            - 'cross_field': Cross-field dependencies
            - 'cross_resource': Cross-resource dependencies (requires all_manifests)
            - 'all': All validations (default)
    
    Returns:
        struct(
            valid=True/False,
            errors=[],       # Critical errors
            warnings=[],     # Non-critical issues
            stats={          # Validation statistics
                'fields_checked': N,
                'rules_passed': N,
                'rules_failed': N,
            }
        )
    """
    context = context or {}
    errors = []
    warnings = []
    stats = {'fields_checked': 0, 'rules_passed': 0, 'rules_failed': 0}
    
    levels = ['schema', 'values', 'cross_field', 'cross_service']
    if level == 'all':
        levels_to_run = levels
    elif level in levels:
        levels_to_run = [level]
    else:
        return struct(
            valid=False,
            errors=[ManifestErrors.new(
                message="Invalid validation level: " + level,
                category=ManifestErrors.CATEGORY['CONFIG'],
                severity=ManifestErrors.SEVERITY['ERROR'],
            )],
            warnings=[],
            stats=stats,
        )
    
    # Run schema validation
    if 'schema' in levels_to_run:
        schema_result = _validate_schema(manifest, context)
        errors.extend(schema_result.errors)
        warnings.extend(schema_result.warnings)
        stats['fields_checked'] += schema_result.stats['fields_checked']
        stats['rules_passed'] += schema_result.stats['rules_passed']
        stats['rules_failed'] += schema_result.stats['rules_failed']
    
    # Run value validation
    if 'values' in levels_to_run:
        values_result = _validate_values(manifest, context)
        errors.extend(values_result.errors)
        warnings.extend(values_result.warnings)
        stats['fields_checked'] += values_result.stats['fields_checked']
        stats['rules_passed'] += values_result.stats['rules_passed']
        stats['rules_failed'] += values_result.stats['rules_failed']
    
    # Run cross-field validation
    if 'cross_field' in levels_to_run:
        cross_field_result = _validate_cross_field(manifest, context)
        errors.extend(cross_field_result.errors)
        warnings.extend(cross_field_result.warnings)
        stats['fields_checked'] += cross_field_result.stats['fields_checked']
        stats['rules_passed'] += cross_field_result.stats['rules_passed']
        stats['rules_failed'] += cross_field_result.stats['rules_failed']
    
    # Run cross-resource validation
    if 'cross_resource' in levels_to_run and context.get('all_manifests'):
        cross_resource_result = _validate_cross_resource(manifest, context)
        errors.extend(cross_resource_result.errors)
        warnings.extend(cross_resource_result.warnings)
        stats['fields_checked'] += cross_resource_result.stats['fields_checked']
        stats['rules_passed'] += cross_resource_result.stats['rules_passed']
        stats['rules_failed'] += cross_resource_result.stats['rules_failed']
    
    # In strict mode, treat warnings as errors
    if context.get('strict'):
        errors.extend([ManifestErrors.new(
            message=w.message,
            category=w.category,
            severity=ManifestErrors.SEVERITY['ERROR'],
            context=w.context,
        ) for w in warnings])
        warnings = []
    
    valid = len([e for e in errors if e.severity == ManifestErrors.SEVERITY['CRITICAL'] or 
                 e.severity == ManifestErrors.SEVERITY['ERROR']]) == 0
    
    return struct(
        valid=valid,
        errors=errors,
        warnings=warnings,
        stats=stats,
    )

def _validate_schema(manifest, context):
    """
    Level 1: Schema Validation
    - Check all required fields present
    - Validate field types
    - Check field formats (regex patterns)
    - Validate enum values
    """
    errors = []
    warnings = []
    stats = {'fields_checked': 0, 'rules_passed': 0, 'rules_failed': 0}
    
    if not manifest:
        errors.append(ManifestErrors.new(
            message="Manifest is empty or None",
            category=ManifestErrors.CATEGORY['SCHEMA'],
            severity=ManifestErrors.SEVERITY['CRITICAL'],
            context={'path': context.get('resource_path', '')},
        ))
        return struct(errors=errors, warnings=warnings, stats=stats)
    
    # Check required fields
    required_fields = ManifestSchema.get_required_fields(manifest)
    for field_name in required_fields:
        stats['fields_checked'] += 1
        
        if field_name not in manifest or manifest[field_name] == None or manifest[field_name] == '':
            errors.append(ManifestErrors.new(
                message="Missing required field: " + field_name,
                category=ManifestErrors.CATEGORY['SCHEMA'],
                severity=ManifestErrors.SEVERITY['ERROR'],
                context={'field': field_name, 'path': context.get('resource_path', '')},
            ))
            stats['rules_failed'] += 1
        else:
            stats['rules_passed'] += 1
    
    # Validate field types and constraints
    for field_name, value in manifest.items():
        if field_name.startswith('_'):  # Skip internal fields
            continue
            
        field_schema = ManifestSchema.get_field(field_name)
        if not field_schema:
            # Unknown field - could be a warning
            continue
        
        stats['fields_checked'] += 1
        
        # Check field type
        field_type = field_schema.get('type')
        type_valid = _check_field_type(field_name, value, field_type, field_schema)
        
        if not type_valid:
            errors.append(ManifestErrors.new(
                message="Field {} has invalid type".format(field_name),
                category=ManifestErrors.CATEGORY['SCHEMA'],
                severity=ManifestErrors.SEVERITY['ERROR'],
                context={'field': field_name, 'value': value},
            ))
            stats['rules_failed'] += 1
        else:
            # Check constraints
            constraints = field_schema.get('constraints', {})
            constraint_result = _check_constraints(field_name, value, constraints)
            
            if constraint_result:
                errors.append(constraint_result)
                stats['rules_failed'] += 1
            else:
                stats['rules_passed'] += 1
    
    return struct(errors=errors, warnings=warnings, stats=stats)

def _validate_values(manifest, context):
    """
    Level 2: Value Validation
    - Port range validation
    - Name format validation
    - String length constraints
    - Numeric range constraints
    - Pattern matching
    """
    errors = []
    warnings = []
    stats = {'fields_checked': 0, 'rules_passed': 0, 'rules_failed': 0}
    
    # Validate port
    if 'port' in manifest:
        stats['fields_checked'] += 1
        port = manifest['port']
        app_type = manifest.get('appType', 'backend')
        
        # Check basic range
        if port < 1024 or port > 65535:
            errors.append(ManifestErrors.new(
                message="Port {} is outside valid range [1024, 65535]".format(port),
                category=ManifestErrors.CATEGORY['VALIDATION'],
                severity=ManifestErrors.SEVERITY['ERROR'],
                context={'field': 'port', 'value': port},
            ))
            stats['rules_failed'] += 1
        else:
            # Check app type specific range
            port_range = PORT_RANGES.get(app_type)
            if port_range:
                if port < port_range['min'] or port > port_range['max']:
                    warnings.append(ManifestErrors.new(
                        message="Port {} is outside recommended range for {} [{}-{}]".format(
                            port, app_type, port_range['min'], port_range['max']
                        ),
                        category=ManifestErrors.CATEGORY['VALIDATION'],
                        severity=ManifestErrors.SEVERITY['WARNING'],
                        context={'field': 'port', 'value': port, 'appType': app_type},
                    ))
                    stats['rules_passed'] += 1
                else:
                    stats['rules_passed'] += 1
            else:
                stats['rules_passed'] += 1
    
    # Validate appName format
    if 'appName' in manifest:
        stats['fields_checked'] += 1
        app_name = manifest['appName']
        
        # Check kebab-case pattern
        if not _matches_pattern(app_name, r'^[a-z][a-z0-9-]*$'):
            errors.append(ManifestErrors.new(
                message="Invalid appName format: {} (must be kebab-case)".format(app_name),
                category=ManifestErrors.CATEGORY['VALIDATION'],
                severity=ManifestErrors.SEVERITY['ERROR'],
                context={'field': 'appName', 'value': app_name},
            ))
            stats['rules_failed'] += 1
        else:
            # Check length
            if len(app_name) < 3:
                errors.append(ManifestErrors.new(
                    message="appName too short (min 3 characters): {}".format(app_name),
                    category=ManifestErrors.CATEGORY['VALIDATION'],
                    severity=ManifestErrors.SEVERITY['ERROR'],
                    context={'field': 'appName', 'value': app_name, 'min_length': 3},
                ))
                stats['rules_failed'] += 1
            elif len(app_name) > 50:
                errors.append(ManifestErrors.new(
                    message="appName too long (max 50 characters): {}".format(app_name),
                    category=ManifestErrors.CATEGORY['VALIDATION'],
                    severity=ManifestErrors.SEVERITY['ERROR'],
                    context={'field': 'appName', 'value': app_name, 'max_length': 50},
                ))
                stats['rules_failed'] += 1
            else:
                stats['rules_passed'] += 1
    
    # Validate replicas
    if 'replicas' in manifest:
        stats['fields_checked'] += 1
        replicas = manifest['replicas']
        
        if replicas < 1:
            errors.append(ManifestErrors.new(
                message="replicas must be at least 1: {}".format(replicas),
                category=ManifestErrors.CATEGORY['VALIDATION'],
                severity=ManifestErrors.SEVERITY['ERROR'],
                context={'field': 'replicas', 'value': replicas},
            ))
            stats['rules_failed'] += 1
        elif replicas > VALIDATION_THRESHOLDS['max_replicas']:
            errors.append(ManifestErrors.new(
                message="replicas exceeds maximum ({}): {}".format(
                    VALIDATION_THRESHOLDS['max_replicas'], replicas
                ),
                category=ManifestErrors.CATEGORY['VALIDATION'],
                severity=ManifestErrors.SEVERITY['ERROR'],
                context={'field': 'replicas', 'value': replicas, 'max': VALIDATION_THRESHOLDS['max_replicas']},
            ))
            stats['rules_failed'] += 1
        else:
            stats['rules_passed'] += 1
    
    # Validate features length
    if 'featuresEnabled' in manifest:
        stats['fields_checked'] += 1
        features = manifest.get('featuresEnabled', [])

        if len(features) > VALIDATION_THRESHOLDS['max_features']:
            warnings.append(ManifestErrors.new(
                message="Too many features ({}), consider splitting resource".format(len(features)),
                category=ManifestErrors.CATEGORY['VALIDATION'],
                severity=ManifestErrors.SEVERITY['WARNING'],
                context={'field': 'featuresEnabled', 'count': len(features), 'max': VALIDATION_THRESHOLDS['max_features']},
            ))
        else:
            stats['rules_passed'] += 1
    
    return struct(errors=errors, warnings=warnings, stats=stats)

def _validate_cross_field(manifest, context):
    """
    Level 3: Cross-Field Validation
    - Frontend requires backend
    - Prisma requires database
    - Port conflicts with app type
    - Dependencies valid
    """
    errors = []
    warnings = []
    stats = {'fields_checked': 0, 'rules_passed': 0, 'rules_failed': 0}
    
    app_type = manifest.get('appType', '')
    
    # Frontend requires backendName
    if app_type == 'frontend':
        stats['fields_checked'] += 1
        
        if not manifest.get('backendName'):
            errors.append(ManifestErrors.new(
                message="Frontend resource must specify backendName",
                category=ManifestErrors.CATEGORY['VALIDATION'],
                severity=ManifestErrors.SEVERITY['ERROR'],
                context={'field': 'backendName', 'appType': 'frontend'},
            ))
            stats['rules_failed'] += 1
        else:
            stats['rules_passed'] += 1
        
        # Frontend should have basePath
        stats['fields_checked'] += 1
        if not manifest.get('basePath'):
            warnings.append(ManifestErrors.new(
                message="Frontend resource should specify basePath for routing",
                category=ManifestErrors.CATEGORY['VALIDATION'],
                severity=ManifestErrors.SEVERITY['WARNING'],
                context={'field': 'basePath', 'appType': 'frontend'},
            ))
        else:
            stats['rules_passed'] += 1
    
    # Prisma requires databaseName
    features = manifest.get('featuresEnabled', [])
    if 'prisma' in features or 'drizzle' in features:
        stats['fields_checked'] += 1

        if not manifest.get('databaseName'):
            warnings.append(ManifestErrors.new(
                message="Resource with 'prisma' or 'drizzle' feature should specify databaseName",
                category=ManifestErrors.CATEGORY['VALIDATION'],
                severity=ManifestErrors.SEVERITY['WARNING'],
                context={'field': 'databaseName', 'featuresEnabled': features},
            ))
        else:
            stats['rules_passed'] += 1
    
    # sablier.deferStart requires sablier.enable
    sablier = manifest.get('sablier', {}) or {}
    if sablier.get('deferStart', False):
        stats['fields_checked'] += 1

        if not sablier.get('enable', False):
            errors.append(ManifestErrors.new(
                message="sablier.deferStart requires sablier.enable to also be true",
                category=ManifestErrors.CATEGORY['VALIDATION'],
                severity=ManifestErrors.SEVERITY['ERROR'],
                context={'field': 'sablier.deferStart', 'sablier': sablier},
            ))
            stats['rules_failed'] += 1
        else:
            stats['rules_passed'] += 1

    # Backend should have Traefik config
    if app_type == 'backend':
        stats['fields_checked'] += 1
        
        if not manifest.get('traefik'):
            warnings.append(ManifestErrors.new(
                message="Backend resource should have Traefik configuration for routing",
                category=ManifestErrors.CATEGORY['VALIDATION'],
                severity=ManifestErrors.SEVERITY['WARNING'],
                context={'field': 'traefik', 'appType': 'backend'},
            ))
        else:
            stats['rules_passed'] += 1
    
    return struct(errors=errors, warnings=warnings, stats=stats)

def _validate_cross_resource(manifest, context):
    """
    Level 4: Cross-Resource Validation
    - dependsOn exist as resources
    - No circular dependencies
    - Backend references are valid
    - Port uniqueness across resources
    """
    errors = []
    warnings = []
    stats = {'fields_checked': 0, 'rules_passed': 0, 'rules_failed': 0}
    
    all_manifests = context.get('all_manifests', [])
    resource_path = context.get('resource_path', '')
    
    if not all_manifests:
        return struct(errors=errors, warnings=warnings, stats=stats)
    
    # Build lookup maps
    app_names = {}
    ports = {}
    
    for m in all_manifests:
        name = m.get('appName', '')
        if name:
            app_names[name] = m
        
        port = m.get('port')
        if port:
            if port not in ports:
                ports[port] = []
            ports[port].append(name)
    
    current_name = manifest.get('appName', '')
    current_port = manifest.get('port')
    
    # Check dependsOn exist
    internal_deps = manifest.get('dependsOn', [])
    if internal_deps:
        stats['fields_checked'] += 1
        
        missing_deps = []
        for dep in internal_deps:
            # Shared platform Postgres aliases are not app services.
            if is_shared_platform_postgres_dependency(dep):
                continue
            if dep not in app_names:
                missing_deps.append(dep)
        
        if missing_deps:
            errors.append(ManifestErrors.new(
                message="Missing resource dependencies: {}".format(', '.join(missing_deps)),
                category=ManifestErrors.CATEGORY['DEPENDENCY'],
                severity=ManifestErrors.SEVERITY['ERROR'],
                context={'field': 'dependsOn', 'missing': missing_deps},
            ))
            stats['rules_failed'] += 1
        else:
            stats['rules_passed'] += 1
    
    # Check backendName exists (for frontends)
    if manifest.get('appType') == 'frontend':
        backend_name = manifest.get('backendName', '')
        if backend_name:
            stats['fields_checked'] += 1
            
            if backend_name not in app_names:
                errors.append(ManifestErrors.new(
                    message="Referenced backend '{}' does not exist".format(backend_name),
                    category=ManifestErrors.CATEGORY['DEPENDENCY'],
                    severity=ManifestErrors.SEVERITY['ERROR'],
                    context={'field': 'backendName', 'value': backend_name},
                ))
                stats['rules_failed'] += 1
            else:
                # Check that backend is actually a backend
                backend_manifest = app_names[backend_name]
                if backend_manifest.get('appType') != 'backend':
                    errors.append(ManifestErrors.new(
                        message="Referenced backend '{}' is not a backend (type: {})".format(
                            backend_name, backend_manifest.get('appType')
                        ),
                        category=ManifestErrors.CATEGORY['DEPENDENCY'],
                        severity=ManifestErrors.SEVERITY['ERROR'],
                        context={'field': 'backendName', 'value': backend_name},
                    ))
                    stats['rules_failed'] += 1
                else:
                    stats['rules_passed'] += 1
    
    # Check port uniqueness
    if current_port and current_port in ports:
        resources_with_port = ports[current_port]
        other_resources = [r for r in resources_with_port if r != current_name]
        
        if other_resources:
            stats['fields_checked'] += 1
            
            errors.append(ManifestErrors.new(
                message="Port {} is already used by: {}".format(current_port, ', '.join(other_resources)),
                category=ManifestErrors.CATEGORY['VALIDATION'],
                severity=ManifestErrors.SEVERITY['ERROR'],
                context={'field': 'port', 'value': current_port, 'conflicts': other_resources},
            ))
            stats['rules_failed'] += 1
        else:
            stats['rules_passed'] += 1
    
    return struct(errors=errors, warnings=warnings, stats=stats)

def _check_field_type(field_name, value, expected_type, field_schema):
    """Check if value matches expected type."""
    if expected_type == 'string':
        return type(value) == "string"
    elif expected_type == 'integer':
        return type(value) == "int"
    elif expected_type == 'boolean':
        return type(value) == "bool"
    elif expected_type == 'list':
        return type(value) == "list"
    elif expected_type == 'dict':
        return type(value) == "dict"
    elif expected_type == 'enum':
        valid_values = field_schema.get('constraints', {}).get('values', [])
        return value in valid_values
    return True

def _check_constraints(field_name, value, constraints):
    """Check value against constraints."""
    # Check pattern
    if 'pattern' in constraints:
        pattern = constraints['pattern']
        if not _matches_pattern(value, pattern):
            return ManifestErrors.new(
                message="Field {} value does not match pattern: {}".format(field_name, pattern),
                category=ManifestErrors.CATEGORY['VALIDATION'],
                severity=ManifestErrors.SEVERITY['ERROR'],
                context={'field': field_name, 'value': value, 'pattern': pattern},
            )
    
    # Check length (for strings and lists)
    if 'min_length' in constraints:
        if len(value) < constraints['min_length']:
            return ManifestErrors.new(
                message="Field {} value too short (min {}): {}".format(
                    field_name, constraints['min_length'], len(value)
                ),
                category=ManifestErrors.CATEGORY['VALIDATION'],
                severity=ManifestErrors.SEVERITY['ERROR'],
                context={'field': field_name, 'value': value, 'min_length': constraints['min_length']},
            )
    
    if 'max_length' in constraints:
        if len(value) > constraints['max_length']:
            return ManifestErrors.new(
                message="Field {} value too long (max {}): {}".format(
                    field_name, constraints['max_length'], len(value)
                ),
                category=ManifestErrors.CATEGORY['VALIDATION'],
                severity=ManifestErrors.SEVERITY['ERROR'],
                context={'field': field_name, 'value': value, 'max_length': constraints['max_length']},
            )
    
    return None

def _chars(text):
    """Split a string into one-character strings; Tilt's Starlark cannot iterate a string directly."""
    return [text[i] for i in range(len(text))]


def _matches_pattern(value, pattern):
    """Simple pattern matching (Starlark doesn't have regex)."""
    # For now, do basic checks
    if pattern == r'^[a-z][a-z0-9-]*$':
        # Kebab-case: starts with letter, then letters/digits/hyphens
        if not value:
            return False
        if not (value[0] >= 'a' and value[0] <= 'z'):
            return False
        for c in _chars(value):
            if not ((c >= 'a' and c <= 'z') or (c >= '0' and c <= '9') or c == '-'):
                return False
        return True
    
    if pattern == r'^[a-z][a-z0-9_]*$':
        # Snake-case for database names
        if not value:
            return False
        if not (value[0] >= 'a' and value[0] <= 'z'):
            return False
        for c in _chars(value):
            if not ((c >= 'a' and c <= 'z') or (c >= '0' and c <= '9') or c == '_'):
                return False
        return True
    
    if pattern == r'^/[a-z][a-z0-9/-]*$':
        # Path prefix: starts with /, then letters/digits/hyphens/slashes
        if not value or value[0] != '/':
            return False
        for c in _chars(value[1:]):
            if not ((c >= 'a' and c <= 'z') or (c >= '0' and c <= '9') or c == '-' or c == '/'):
                return False
        return True
    
    # Default: accept
    return True

def is_valid(manifest, context=None):
    """
    Quick check if manifest is valid.
    
    Args:
        manifest: Manifest dict to check
        context: Optional context for validation
    
    Returns:
        True if valid (no critical errors)
    """
    result = validate(manifest, context, level='all')
    return result.valid

def get_validation_report(manifest, context=None):
    """
    Generate detailed validation report.
    
    Args:
        manifest: Manifest dict to validate
        context: Optional context for validation
    
    Returns:
        Human-readable report string
    """
    result = validate(manifest, context, level='all')
    
    lines = []
    lines.append("=" * 70)
    lines.append("📋 MANIFEST VALIDATION REPORT")
    lines.append("=" * 70)
    
    # Summary
    status = "✅ PASSED" if result.valid else "❌ FAILED"
    lines.append("Status: " + status)
    lines.append("")
    
    # Statistics
    lines.append("Fields Checked: {}".format(result.stats['fields_checked']))
    lines.append("Rules Passed: {}".format(result.stats['rules_passed']))
    lines.append("Rules Failed: {}".format(result.stats['rules_failed']))
    lines.append("")
    
    # Errors
    if result.errors:
        lines.append("ERRORS ({}):".format(len(result.errors)))
        for error in result.errors:
            formatted = ManifestErrors.format(error)
            lines.append("  - " + formatted)
        lines.append("")
    
    # Warnings
    if result.warnings:
        lines.append("WARNINGS ({}):".format(len(result.warnings)))
        for warning in result.warnings:
            formatted = ManifestErrors.format(warning)
            lines.append("  - " + formatted)
        lines.append("")
    
    lines.append("=" * 70)
    
    return "\n".join(lines)

def validate_schema(manifest):
    """
    Quick schema-only validation.
    
    Args:
        manifest: Manifest dict
    
    Returns:
        Validation result struct
    """
    return validate(manifest, level='schema')

def validate_values(manifest):
    """
    Quick values-only validation.
    
    Args:
        manifest: Manifest dict
    
    Returns:
        Validation result struct
    """
    return validate(manifest, level='values')

def validate_dependencies(manifest, all_manifests):
    """
    Validate dependencies against all resources.
    
    Args:
        manifest: Manifest to validate
        all_manifests: List of all manifests for reference
    
    Returns:
        Validation result struct
    """
    context = {'all_manifests': all_manifests}
    return validate(manifest, context, level='cross_resource')

# Export validator functions
ManifestValidator = struct(
    validate=validate,
    is_valid=is_valid,
    get_report=get_validation_report,
    validate_schema=validate_schema,
    validate_values=validate_values,
    validate_dependencies=validate_dependencies,
)

VALIDATION = {}
