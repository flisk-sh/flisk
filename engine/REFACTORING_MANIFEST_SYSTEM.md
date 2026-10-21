# 📋 Manifest System Refactoring Plan

## Executive Summary

This document outlines a comprehensive refactoring of the manifest parsing and validation system in the Flisk Landscape Tilt infrastructure. The goal is to move from scattered inline logic to a clean, modular, well-tested architecture.

**Current State:**
- Manifest parsing scattered across `discovery.star`, `registry.star`, and multiple generator files
- Validation logic inline and duplicated
- No clear separation between loading, parsing, and validation
- Schema definitions mixed with business logic

**Target State:**
- Dedicated `manifest/` module with clear separation of concerns
- Parser, validator, loader, schema, and fetch as separate modules
- Comprehensive attribute and value verification
- Backward compatibility maintained during migration

---

## New Architecture

### Folder Structure

```
.tilt/topologies/tilt/
├── manifest/                          # NEW: Manifest system module
│   ├── __init__.star                  # Module exports and facade
│   ├── loader.star                    # File loading and I/O
│   ├── parser.star                    # JSON parsing and normalization
│   ├── validator.star                 # Schema and value validation
│   ├── schema.star                    # Schema definitions and constraints
│   ├── fetch.star                     # Remote manifest fetching (future)
│   ├── constants.star                 # Manifest-specific constants
│   ├── errors.star                    # Error types and handling
│   └── tests/                         # Unit tests for manifest system
│       ├── test_loader.star
│       ├── test_parser.star
│       ├── test_validator.star
│       └── test_schema.star
│
├── discovery/                         # EXISTING: Service discovery
│   ├── manifest/                      # DEPRECATED: Will be moved to ../manifest/
│   │   └── constants.star             # Will migrate to ../manifest/constants.star
│   ├── discovery.star                 # Will use new manifest module
│   └── registry.star                  # Will use new manifest module
│
└── generators/                        # EXISTING: Config generators
    └── validators.star                # Will use new manifest/validator.star
```

---

## Module Specifications

### 1. `manifest/__init__.star` - Module Facade

**Purpose:** Provide a clean API surface for other modules

**Exports:**
```starlark
# Main API
Manifest = struct(
    # Loader functions
    load_from_file = loader.load_from_file,
    load_from_path = loader.load_from_path,
    load_all = loader.load_all,
    
    # Parser functions
    parse = parser.parse,
    normalize = parser.normalize,
    extract_resource_path = parser.extract_resource_path,
    
    # Validator functions
    validate = validator.validate,
    validate_schema = validator.validate_schema,
    validate_values = validator.validate_values,
    validate_dependencies = validator.validate_dependencies,
    
    # Schema access
    schema = schema.MANIFEST_SCHEMA,
    defaults = constants.MANIFEST_DEFAULTS,
    constraints = schema.CONSTRAINTS,
    
    # Error handling
    errors = errors.MANIFEST_ERRORS,
    is_valid = validator.is_valid,
    get_validation_report = validator.get_validation_report,
)
```

**Usage Example:**
```starlark
load("../manifest/__init__.star", "Manifest")

# Load and validate in one call
result = Manifest.load_from_file("services/product/user/user-management-backend/service.json")
if result.error:
    print("Failed to load manifest:", result.error)
else:
    manifest = result.manifest
    # Use validated manifest
```

---

### 2. `manifest/loader.star` - File Loading and I/O

**Purpose:** Handle all file system operations for manifest loading

**Functions:**

```starlark
def load_from_file(path):
    """
    Load a single manifest from file path.
    
    Args:
        path: Absolute or relative path to manifest JSON file
    
    Returns:
        struct(manifest=None, error=None, metadata={})
        - manifest: Parsed manifest dict or None if error
        - error: Error message string or None
        - metadata: Dict with load info (timestamp, file_size, path)
    """

def load_from_path(resource_path):
    """
    Load manifest from resource directory (auto-detects manifest file).

    Args:
        resource_path: Path to resource directory

    Returns:
        Same as load_from_file
    """

def load_all(resources_root, filters=None):
    """
    Load all manifests from resources directory with optional filtering.

    Args:
        resources_root: Root directory to search (e.g., "services/product")
        filters: Optional dict of filters:
            - appType: ['frontend', 'backend', 'library', ...]
            - stack: ['user', 'order', ...]
            - features: ['nats', 'prisma', ...]

    Returns:
        struct(
            manifests=[],        # List of loaded manifests
            errors=[],           # List of (path, error) tuples
            stats={              # Loading statistics
                'total_found': N,
                'successful': N,
                'failed': N,
                'filtered_out': N,
            }
        )
    """

def watch_manifest(path):
    """
    Set up file watch for manifest changes (Tilt integration).
    
    Args:
        path: Path to manifest file
    
    Returns:
        watch_spec for Tilt
    """

def get_manifest_path(resource_path):
    """
    Get the expected manifest file path for a resource directory.

    Args:
        resource_path: Resource directory path

    Returns:
        Expected manifest file path or None
    """
```

**Implementation Notes:**
- Uses `read_file()` with proper error handling
- Caches loaded manifests to avoid redundant I/O
- Provides detailed error messages with context
- Integrates with Tilt's file watching system

---

### 3. `manifest/parser.star` - JSON Parsing and Normalization

**Purpose:** Transform raw JSON into normalized, validated manifest structures

**Functions:**

```starlark
def parse(content, path=""):
    """
    Parse JSON content into manifest dict.
    
    Args:
        content: Raw JSON string
        path: Optional path for error context
    
    Returns:
        struct(manifest=None, error=None, warnings=[])
    """

def normalize(manifest, resource_path=""):
    """
    Normalize manifest with default values and computed fields.

    Args:
        manifest: Raw parsed manifest dict
        resource_path: Resource directory path for context
    
    Returns:
        Normalized manifest dict with all fields populated
    
    Normalization Steps:
        1. Apply defaults for missing fields
        2. Compute derived fields (appType from path if missing)
        3. Validate field types and formats
        4. Set up internal dependencies
        5. Compute sync paths based on features
        6. Normalize environment variables
        7. Set up Traefik configuration defaults
    """

def extract_resource_path(manifest_path):
    """
    Extract resource directory path from manifest file path.

    Args:
        manifest_path: Path to manifest JSON file

    Returns:
        Resource directory path
    """

def extract_stack(resource_path):
    """
    Extract stack from resource path.

    Args:
        resource_path: Resource directory path

    Returns:
        Stack string (e.g., 'user', 'order')
    """

def determine_app_type(manifest, resource_path):
    """
    Determine app type from manifest or resource path.

    Args:
        manifest: Manifest dict
        resource_path: Resource directory path

    Returns:
        App type string ('frontend', 'backend', 'library', etc.)
    """

def compute_syncs(app_type, features):
    """
    Compute default sync paths based on app type and features.
    
    Args:
        app_type: App type string
        features: List of feature strings
    
    Returns:
        List of sync paths
    """

def parse_traefik_config(manifest):
    """
    Parse and normalize Traefik configuration.
    
    Args:
        manifest: Manifest dict
    
    Returns:
        Normalized Traefik config dict
    """

def merge_manifests(base, overlay):
    """
    Merge two manifest dicts (for inheritance patterns).
    
    Args:
        base: Base manifest dict
        overlay: Overlay manifest dict
    
    Returns:
        Merged manifest dict
    """
```

**Implementation Notes:**
- Pure functions with no side effects
- Comprehensive warning system for deprecated fields
- Supports manifest inheritance/overlays
- Detailed error context with path information

---

### 4. `manifest/schema.star` - Schema Definitions and Constraints

**Purpose:** Define the complete manifest schema with types, constraints, and documentation

**Schema Definition:**

```starlark
# Complete manifest field schema
MANIFEST_SCHEMA = {
    'appName': {
        'type': 'string',
        'required': True,
        'pattern': r'^[a-z][a-z0-9-]*$',
        'min_length': 3,
        'max_length': 50,
        'description': 'Unique resource name (kebab-case)',
        'example': 'user-management-backend',
    },
    'appType': {
        'type': 'string',
        'required': True,
        'enum': ['frontend', 'backend', 'library', 'migrator', 'sdk', 'worker'],
        'description': 'Type of application',
        'default': 'backend',
    },
    'stack': {
        'type': 'string',
        'required': True,
        'enum': ['user', 'staff', 'identity', 'order', 'treatment', 
                 'platform', 'inventory', 'billing', 'notification', 'analytics'],
        'description': 'Technology stack this resource belongs to',
    },
    'port': {
        'type': 'integer',
        'required': True,
        'min': 1024,
        'max': 65535,
        'description': 'External resource port',
        'constraints': 'Must be unique per resource',
    },
    'internalPort': {
        'type': 'integer',
        'required': False,
        'default': 3000,
        'description': 'Internal container port (usually 3000)',
        'constant': True,  # Should rarely change
    },
    'replicas': {
        'type': 'integer',
        'required': False,
        'default': 1,
        'min': 1,
        'max': 5,  # Reasonable limit
        'description': 'Number of container replicas',
    },
    'runtime': {
        'type': 'string',
        'required': False,
        'default': 'bun',
        'enum': ['bun', 'node', 'python', 'go'],
        'description': 'Runtime environment',
    },
    'features': {
        'type': 'list',
        'required': False,
        'default': [],
        'items': {
            'type': 'string',
            'enum': ['nats', 'prisma', 'redis', 'infisical', 'vitest', 
                     'traefik', 'websocket', 'graphql', 'grpc', 'vite-node'],
        },
        'description': 'Feature flags for this resource',
    },
    'databaseName': {
        'type': 'string',
        'required': False,
        'pattern': r'^[a-z][a-z0-9_]*$',
        'description': 'PostgreSQL database name',
    },
    'dependsOn': {
        'type': 'list',
        'required': False,
        'default': [],
        'items': {'type': 'string'},
        'description': 'Other resources this depends on',
    },
    'envVars': {
        'type': 'dict',
        'required': False,
        'default': {},
        'description': 'Environment variables',
    },
    'traefik': {
        'type': 'dict',
        'required': False,
        'schema': {
            'pathPrefix': {'type': 'string', 'required': True},
            'host': {'type': 'string', 'required': False},
            'priority': {'type': 'integer', 'required': False, 'min': 1, 'max': 1000},
        },
    },
    # Frontend-specific fields
    'backendName': {
        'type': 'string',
        'required': False,
        'condition': "appType == 'frontend'",  # Required for frontends
        'description': 'Associated backend resource name',
    },
    'basePath': {
        'type': 'string',
        'required': False,
        'condition': "appType == 'frontend'",
        'pattern': r'^/[a-z][a-z0-9-]*$',
        'description': 'URL base path for frontend',
    },
    # Advanced fields
    'syncs': {
        'type': 'list',
        'required': False,
        'description': 'Custom sync paths (auto-computed if not provided)',
    },
    'startCommand': {
        'type': 'string',
        'required': False,
        'description': 'Custom container start command',
    },
    'targetPath': {
        'type': 'string',
        'required': False,
        'description': 'Frontend build target path',
    },
}

# Cross-field constraints
CONSTRAINTS = {
    # Port uniqueness will be validated across all manifests
    'port_unique': True,
    
    # App type specific rules
    'frontend_requires_backend': {
        'condition': "appType == 'frontend'",
        'requires': ['backendName', 'basePath'],
    },
    
    # Feature dependencies
    'prisma_requires_database': {
        'condition': "'prisma' in features",
        'requires': ['databaseName'],
    },
    
    # Port ranges by app type
    'port_ranges': {
        'frontend': {'min': 3000, 'max': 3999},
        'backend': {'min': 4000, 'max': 5999},
        'worker': {'min': 6000, 'max': 6999},
    },
}
```

**Functions:**

```starlark
def get_field_schema(field_name):
    """Get schema definition for a specific field."""

def validate_field_type(field_name, value):
    """Validate a single field's type against schema."""

def get_default_value(field_name):
    """Get default value for a field."""

def get_required_fields(manifest):
    """Get list of required fields based on manifest context."""

def get_field_constraints(field_name):
    """Get constraints for a specific field."""
```

---

### 5. `manifest/validator.star` - Comprehensive Validation

**Purpose:** Validate manifest structure, values, and cross-resource dependencies

**Validation Levels:**

```starlark
def validate(manifest, context=None, level='all'):
    """
    Comprehensive manifest validation.
    
    Args:
        manifest: Manifest dict to validate
        context: Optional context dict:
            - all_manifests: List of all manifests for cross-validation
            - resource_path: Path for error context
            - strict: Boolean for strict mode
        level: Validation level
            - 'schema': Structure and types only
            - 'values': Value constraints
            - 'dependencies': Cross-resource dependencies
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

def validate_schema(manifest):
    """
    Level 1: Schema Validation
    - Check all required fields present
    - Validate field types
    - Check field formats (regex patterns)
    - Validate enum values
    """

def validate_values(manifest):
    """
    Level 2: Value Validation
    - Port range validation
    - Name format validation
    - String length constraints
    - Numeric range constraints
    - Pattern matching
    """

def validate_cross_field(manifest):
    """
    Level 3: Cross-Field Validation
    - Frontend requires backend
    - Prisma requires database
    - Port conflicts with app type
    - Dependencies valid
    """

def validate_dependencies(manifest, all_manifests):
    """
    Level 4: Cross-Resource Validation
    - dependsOn exist as resources
    - No circular dependencies
    - Backend references are valid
    - Port uniqueness across resources
    """

def validate_ports_unique(manifests):
    """
    Check for port conflicts across all manifests.
    
    Returns:
        List of port conflict errors
    """

def validate_naming_consistency(manifests):
    """
    Check naming conventions across all resources.

    Validates:
    - Resource names follow convention: {stack}-{function}-{type}
    - No duplicate names
    - Consistent kebab-case
    """

def is_valid(manifest):
    """Quick check if manifest is valid (returns boolean)."""

def get_validation_report(manifest, context=None):
    """
    Generate detailed validation report.
    
    Returns:
        Human-readable report with all issues and suggestions
    """
```

**Validation Rules:**

```starlark
VALIDATION_RULES = {
    # Schema rules
    'required_fields': {
        'severity': 'error',
        'check': lambda m: all(m.get(f) for f in get_required_fields(m)),
        'message': 'Missing required field: {field}',
    },
    
    'field_types': {
        'severity': 'error',
        'check': _check_field_types,
        'message': 'Field {field} has invalid type: {actual}, expected: {expected}',
    },
    
    # Value rules
    'port_range': {
        'severity': 'error',
        'check': lambda m: _check_port_in_range(m),
        'message': 'Port {port} is outside valid range for {appType}: {min}-{max}',
    },
    
    'name_format': {
        'severity': 'error',
        'check': lambda m: re.match(r'^[a-z][a-z0-9-]*$', m.get('appName', '')),
        'message': 'Invalid appName format: {name}',
    },
    
    # Cross-field rules
    'frontend_has_backend': {
        'severity': 'error',
        'condition': lambda m: m.get('appType') == 'frontend',
        'check': lambda m: m.get('backendName'),
        'message': 'Frontend {name} must specify backendName',
    },
    
    'prisma_has_database': {
        'severity': 'warning',
        'condition': lambda m: 'prisma' in m.get('featuresEnabled', []),
        'check': lambda m: m.get('databaseName'),
        'message': 'Service with prisma feature should specify databaseName',
    },
    
    # Cross-resource rules
    'dependencies_exist': {
        'severity': 'error',
        'check': lambda m, ctx: _check_deps_exist(m, ctx.get('all_manifests', [])),
        'message': 'Dependency {dep} does not exist as a resource',
    },
    
    'no_circular_deps': {
        'severity': 'error',
        'check': _check_no_circular_deps,
        'message': 'Circular dependency detected: {path}',
    },
}
```

---

### 6. `manifest/fetch.star` - Remote Manifest Fetching (Future)

**Purpose:** Fetch manifests from remote sources (for distributed teams or external resources)

```starlark
def fetch_from_git(repo_url, branch="main", path=""):
    """
    Fetch manifest from git repository.
    
    Future use case: External resource definitions
    """

def fetch_from_http(url):
    """
    Fetch manifest from HTTP endpoint.

    Future use case: Resource registry API
    """

def fetch_from_registry(resource_name, registry_url):
    """
    Fetch manifest from resource registry.

    Future use case: Centralized resource catalog
    """
```

**Note:** This module is for future use. Initial refactoring focuses on local manifests.

---

### 7. `manifest/errors.star` - Error Types and Handling

**Purpose:** Standardized error handling with context

```starlark
# Error severity levels
SEVERITY = {
    'CRITICAL': 'critical',  # Must fix, system won't function
    'ERROR': 'error',        # Should fix, may cause issues
    'WARNING': 'warning',    # Should consider, non-blocking
    'INFO': 'info',          # Informational only
}

# Error categories
CATEGORY = {
    'SCHEMA': 'schema',
    'VALIDATION': 'validation',
    'IO': 'io',
    'PARSE': 'parse',
    'DEPENDENCY': 'dependency',
}

def new_error(message, category, severity, context=None):
    """
    Create standardized error struct.
    
    Args:
        message: Human-readable error message
        category: Error category
        severity: Error severity
        context: Optional dict with:
            - field: Field name if field-specific
            - path: File path
            - value: Invalid value
            - suggestion: Suggested fix
    
    Returns:
        Error struct
    """

def format_error(error):
    """Format error for display."""

def group_errors(errors):
    """Group errors by category and severity."""

def has_critical_errors(errors):
    """Check if any critical errors exist."""
```

---

## Migration Strategy

### Phase 1: Foundation (Week 1-2)

**Goals:**
- Create new `manifest/` module structure
- Implement `constants.star`, `errors.star`, `schema.star`
- Write comprehensive tests

**Tasks:**
1. Create directory structure
2. Migrate `discovery/manifest/constants.star` → `manifest/constants.star`
3. Implement `schema.star` with complete field definitions
4. Implement `errors.star` with error handling
5. Write unit tests for schema and errors

**Backward Compatibility:**
- Keep `discovery/manifest/constants.star` as re-export wrapper
- Mark old path as deprecated in comments

### Phase 2: Core Implementation (Week 3-4)

**Goals:**
- Implement `loader.star` and `parser.star`
- Migrate loading logic from `discovery.star`

**Tasks:**
1. Implement `loader.star` with all loading functions
2. Implement `parser.star` with normalization logic
3. Extract parsing logic from `discovery.star`
4. Create comprehensive parser tests
5. Benchmark performance vs old implementation

**Backward Compatibility:**
- `discovery.star` re-exports from new module
- Gradual migration of consumers

### Phase 3: Validation (Week 5-6)

**Goals:**
- Implement comprehensive `validator.star`
- Replace inline validation in generators

**Tasks:**
1. Implement `validator.star` with all validation levels
2. Migrate validation from `generators/validators.star`
3. Add validation to manifest loading pipeline
4. Create validation report generator
5. Add CLI command to validate all manifests

**Backward Compatibility:**
- Old validators call new validator module
- Maintain same validation behavior

### Phase 4: Integration (Week 7)

**Goals:**
- Wire up `__init__.star` facade
- Migrate all consumers
- Clean up old code

**Tasks:**
1. Implement `__init__.star` with clean API
2. Update `discovery.star` to use new module
3. Update `registry.star` to use new module
4. Update `generators/` to use new module
5. Update `resources/orchestrator/` to use new module
6. Remove deprecated re-export files
7. Update all `load()` statements

### Phase 5: Cleanup (Week 8)

**Goals:**
- Remove deprecated code
- Update documentation
- Final testing

**Tasks:**
1. Remove old `discovery/manifest/` directory
2. Remove deprecated re-export wrappers
3. Update all documentation references
4. Run full integration tests
5. Update AGENTS.md with new structure

---

## Backward Compatibility Plan

### During Migration (Phases 1-4)

**Re-Export Pattern:**
```starlark
# In old file (e.g., discovery/manifest/constants.star)
# DEPRECATED: Use manifest/constants.star instead
load("../../manifest/constants.star", 
    MANIFEST_FILENAME="MANIFEST_FILENAME",
    MANIFEST_DEFAULTS="MANIFEST_DEFAULTS",
    # ... etc
)
```

**Gradual Migration:**
- Each consumer updated individually
- PRs reviewed separately
- No breaking changes during migration

### After Migration (Phase 5)

**Breaking Changes:**
- Old import paths removed
- Clear migration guide provided
- One-time update required

**Migration Guide:**
```starlark
# OLD (deprecated)
load("../discovery/manifest/constants.star", "MANIFEST_DEFAULTS")
load("../discovery/discovery.star", "_load_manifest_json")

# NEW
load("../manifest/__init__.star", "Manifest")
# Use Manifest.defaults, Manifest.load_from_file, etc.
```

---

## Testing Strategy

### Unit Tests

Each module has comprehensive unit tests:

```
manifest/tests/
├── test_loader.star        # Test all loading scenarios
├── test_parser.star        # Test parsing and normalization
├── test_validator.star     # Test all validation rules
├── test_schema.star        # Test schema definitions
└── test_integration.star   # End-to-end integration tests
```

**Test Coverage:**
- Happy path: Valid manifests load correctly
- Error cases: Invalid manifests produce clear errors
- Edge cases: Empty manifests, missing fields, etc.
- Performance: Loading 100+ manifests efficiently

### Integration Tests

**Full Stack Test:**
```starlark
def test_full_manifest_pipeline():
    # Load all manifests
    result = Manifest.load_all("services/product")
    
    # Validate all
    for manifest in result.manifests:
        validation = Manifest.validate(manifest, level='all')
        assert validation.valid, validation.errors
    
    # Check cross-resource dependencies
    deps_validation = Manifest.validate_dependencies(
        result.manifests
    )
    assert deps_validation.valid
```

---

## Benefits

### 1. **Separation of Concerns**
- Loading, parsing, and validation are distinct
- Each module has single responsibility
- Easier to understand and maintain

### 2. **Testability**
- Each module independently testable
- Clear inputs and outputs
- Mock-friendly interfaces

### 3. **Extensibility**
- Easy to add new validation rules
- Easy to support new manifest formats
- Easy to add remote fetching

### 4. **Developer Experience**
- Clear API via `__init__.star` facade
- Comprehensive error messages
- Validation reports with suggestions

### 5. **Documentation**
- Schema serves as living documentation
- Each field has description and example
- Constraints are explicitly defined

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking changes | Gradual migration with re-exports |
| Performance regression | Benchmark tests before/after |
| Validation behavior changes | Comprehensive test suite |
| Increased complexity | Clear module boundaries, good docs |
| Migration takes too long | Phased approach, each phase deliverable |

---

## Success Metrics

- [ ] All 538 manifest references migrated
- [ ] 100% test coverage for new modules
- [ ] Zero breaking changes during migration
- [ ] Load time for 100 manifests < 1 second
- [ ] Validation catches 100% of invalid manifests
- [ ] All developers can understand new structure in < 10 minutes

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Create Phase 1 PR** with module structure
3. **Set up test framework** for manifest tests
4. **Begin implementation** following migration phases
5. **Track progress** with success metrics

---

**Document Version:** 1.0  
**Last Updated:** 2026-04-07  
**Author:** super (with topology-engineer consultation)  
**Reviewers:** Pending
