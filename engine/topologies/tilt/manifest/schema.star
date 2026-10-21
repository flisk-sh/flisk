# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📋 MANIFEST MODULE - SCHEMA DEFINITIONS
# =============================================================================
# Path: .tilt/topologies/tilt/manifest/schema.star
# Purpose: Complete manifest field schema with types, constraints, and validation
# Status: Phase 1 of manifest system refactoring
# =============================================================================

# === INLINED CONSTANTS for pure extension loading ===
VALID_STACKS = ()  # Stacks are project-specific, discovered dynamically
VALID_FEATURES = "api-client", "env-config", "api-index", "prisma", "drizzle", "ddd", "nats", "redis", "infisical", "vitest", "traefik", "websocket", "graphql", "grpc", "vite-node", "maintenance", "sablier"
PORT_RANGES = {"frontend": {"min": 3000, "max": 5999}, "backend": {"min": 4000, "max": 5999}, "worker": {"min": 6000, "max": 6999}, "migrator": {"min": 7000, "max": 7999}, "sdk": {"min": 3000, "max": 9999}, "library": {"min": 3000, "max": 9999}}
RUNTIME = "bun"
TRAEFIK_CONFIG = {"entrypoint": "web", "network": "traefik-public", "default_host": "localhost", "default_port": 8080, "tls_enabled": False, "entrypoints": ["web"], "middlewares": [], "tls": {"enabled": False}, "healthcheck_path": "/health", "healthcheck_interval": "10s", "healthcheck_timeout": "5s", "frontend_priority_base": 100}
BASE_PORT_FRONTEND = 3000
DEFAULTS = {}

# === END INLINED CONSTANTS ===


load("./constants.star",
    "VALID_APP_TYPES",
    "MANIFEST_DEFAULTS",
    "VALIDATION_THRESHOLDS",
)


# Import from master configs for tech stack and service defaults



# Field type definitions
FIELD_TYPES = {
    'string': 'string',
    'integer': 'integer',
    'boolean': 'boolean',
    'list': 'list',
    'dict': 'dict',
    'enum': 'enum',  # One of predefined values
}

# Complete manifest field schema
# Each field has: type, required, constraints, description
MANIFEST_SCHEMA = {
    # Core Identification Fields
    'appName': {
        'type': 'string',
        'required': True,
        'constraints': {
            'pattern': r'^[a-z][a-z0-9-]*$',
            'min_length': 3,
            'max_length': 50,
        },
        'description': 'Unique resource name in kebab-case',
        'example': 'user-management-backend',
    },
    'appType': {
        'type': 'enum',
        'required': True,
        'constraints': {
            'values': VALID_APP_TYPES,
        },
        'description': 'Type of application',
        'default': 'backend',
    },
    'stack': {
        'type': 'string',
        'required': True,
        'constraints': {'min_length': 1},
        'description': 'Technology stack this resource belongs to',
        'example': 'user',
    },
    
    # Network Configuration
    'port': {
        'type': 'integer',
        'required': True,
        'constraints': {
            'min': 1024,
            'max': 65535,
            'port_range_check': True,  # Must be in appType range
        },
        'description': 'External resource port',
        'example': 4000,
    },
    'internalPort': {
        'type': 'integer',
        'required': False,
        'constraints': {
            'min': 1,
            'max': 65535,
            'constant': True,  # Should rarely change from default
        },
        'description': 'Internal container port',
        'default': BASE_PORT_FRONTEND,
    },
    'replicas': {
        'type': 'integer',
        'required': False,
        'constraints': {
            'min': 1,
            'max': VALIDATION_THRESHOLDS['max_replicas'],
        },
        'description': 'Number of container replicas for high availability',
        'default': 1,
    },
    
    # Runtime Configuration
    'runtime': {
        'type': 'enum',
        'required': False,
        'constraints': {
            'values': [RUNTIME, 'node', 'python', 'go'],
        },
        'description': 'Runtime environment',
        'default': RUNTIME,
    },
    'featuresEnabled': {
        'type': 'list',
        'required': False,
        'constraints': {
            'item_type': 'enum',
            'item_values': VALID_FEATURES,
            'max_length': VALIDATION_THRESHOLDS['max_features'],
            'unique': True,
        },
        'description': 'Feature flags enabling specific capabilities',
        'default': [],
    },
    
    # Database Configuration
    'databaseName': {
        'type': 'string',
        'required': False,
        'constraints': {
            'pattern': r'^[a-z][a-z0-9_]*$',
            'max_length': 63,
        },
        'description': 'PostgreSQL database name (required if using prisma)',
        'example': 'TDK_user',
    },
    
    # Dependency Configuration
    'dependsOn': {
        'type': 'list',
        'required': False,
        'constraints': {
            'item_type': 'string',
            'max_length': VALIDATION_THRESHOLDS['max_dependencies'],
        },
        'description': 'Other resources this resource depends on',
        'default': [],
    },
    
    # Environment Configuration
    'envVars': {
        'type': 'dict',
        'required': False,
        'constraints': {
            'max_keys': VALIDATION_THRESHOLDS['max_env_vars'],
        },
        'description': 'Environment variables for the resource',
        'default': {},
    },
    
    # Frontend-Specific Fields
    'backendName': {
        'type': 'string',
        'required': False,
        'constraints': {
            'pattern': r'^[a-z][a-z0-9-]*$',
        },
        'description': 'Associated backend resource name (required for frontends)',
        'condition': "appType == 'frontend'",  # Required only for frontends
        'example': 'user-management-backend',
    },
    'basePath': {
        'type': 'string',
        'required': False,
        'constraints': {
            'pattern': r'^/[a-z][a-z0-9-]*$',
        },
        'description': 'URL base path for frontend (required for frontends)',
        'condition': "appType == 'frontend'",
        'example': '/users',
    },
    'targetPath': {
        'type': 'string',
        'required': False,
        'description': 'Frontend build target path in container',
        'default': '/usr/share/nginx/html',
    },
    
    # Advanced Configuration
    'syncs': {
        'type': 'list',
        'required': False,
        'constraints': {
            'item_type': 'string',
        },
        'description': 'Custom sync paths (auto-computed if not provided)',
    },
    'startCommand': {
        'type': 'string',
        'required': False,
        'description': 'Custom container start command (overrides default)',
        'example': 'bun run start:prod',
    },
    'prismaClientPath': {
        'type': 'string',
        'required': False,
        'description': 'Custom path for Prisma client',
    },
    'registryHost': {
        'type': 'string',
        'required': False,
        'description': 'Custom npm registry host',
    },
    
    # Traefik Configuration
    'traefik': {
        'type': 'dict',
        'required': False,
        'schema': {
            'pathPrefix': {
                'type': 'string',
                'required': True,
                'constraints': {
                    'pattern': r'^/[a-z][a-z0-9/-]*$',
                },
                'description': 'URL path prefix for routing',
                'example': '/api/v1/user-management',
            },
            'host': {
                'type': 'string',
                'required': False,
                'description': 'Custom host for routing',
                'example': 'user.backend.localhost',
            },
            'priority': {
                'type': 'integer',
                'required': False,
                'constraints': {
                    'min': 1,
                    'max': 1000,
                },
                'description': 'Route priority (higher = evaluated first)',
                'default': TRAEFIK_CONFIG['frontend_priority_base'],
            },
        },
        'description': 'Traefik reverse proxy configuration',
    },

    # Sablier Configuration (on-demand start/stop for idle resources)
    'sablier': {
        'type': 'dict',
        'required': False,
        'schema': {
            'enable': {
                'type': 'boolean',
                'required': False,
                'default': False,
                'description': 'Scale this resource to zero when idle; Sablier wakes it on the next request',
            },
            'group': {
                'type': 'string',
                'required': False,
                'description': 'Resources sharing a group wake and sleep together (defaults to `stack`)',
                'example': 'restaurant',
            },
            'sessionDuration': {
                'type': 'string',
                'required': False,
                'default': '10m',
                'description': 'How long the resource stays up after its last request, as a Go duration (e.g. "10m", "1h")',
                'example': '10m',
            },
            'deferStart': {
                'type': 'boolean',
                'required': False,
                'default': False,
                'description': 'Skip this resource during flisk up entirely (no container is created or started); a Traefik static route wakes it and its dependencies on the first request instead. Requires enable: true.',
            },
        },
        'description': 'On-demand scaling via Sablier: stop idle containers, wake them on the next request. Not recommended for stateful resources (databases) with in-flight writes. (Premium - requires TDK_LICENSE_KEY; see hasSablierLicense() in extension-fetch.ts)',
    },
}

# Cross-field validation constraints
CROSS_FIELD_CONSTRAINTS = {
    'frontend_requires_backend': {
        'condition': {'field': 'appType', 'equals': 'frontend'},
        'requires': ['backendName', 'basePath'],
        'severity': 'error',
        'message': 'Frontend resources must specify backendName and basePath',
    },
    'prisma_requires_database': {
        'condition': {'field': 'featuresEnabled', 'contains': 'prisma'},
        'requires': ['databaseName'],
        'severity': 'warning',
        'message': 'Resources using Prisma should specify databaseName',
    },
    'drizzle_requires_database': {
        'condition': {'field': 'featuresEnabled', 'contains': 'drizzle'},
        'requires': ['databaseName'],
        'severity': 'warning',
        'message': 'Resources using Drizzle should specify databaseName',
    },
    'traefik_for_backends': {
        'condition': {'field': 'appType', 'equals': 'backend'},
        'requires': ['traefik'],
        'severity': 'warning',
        'message': 'Backend resources should have Traefik configuration',
    },
}

# Schema-level constraints
SCHEMA_CONSTRAINTS = {
    'unique_ports': True,
    'unique_resource_names': True,
    'valid_dependency_references': True,
    'no_circular_dependencies': True,
}

def get_field_schema(field_name):
    """
    Get schema definition for a specific field.
    
    Args:
        field_name: Name of the field
    
    Returns:
        Field schema dict or None if field doesn't exist
    """
    return MANIFEST_SCHEMA.get(field_name)

def get_required_fields(manifest=None):
    """
    Get list of required fields.
    
    Args:
        manifest: Optional manifest dict to check conditional requirements
    
    Returns:
        List of required field names
    """
    required = []
    
    for field_name, schema in MANIFEST_SCHEMA.items():
        if schema.get('required', False):
            required.append(field_name)
        
        # Check conditional requirements
        if manifest and 'condition' in schema:
            condition = schema['condition']
            # Simple condition evaluation
            if 'appType' in condition and manifest.get('appType') in condition:
                required.append(field_name)
    
    return required

def get_field_constraints(field_name):
    """
    Get constraints for a specific field.
    
    Args:
        field_name: Name of the field
    
    Returns:
        Field constraints dict or None
    """
    schema = get_field_schema(field_name)
    if schema:
        return schema.get('constraints', {})
    return None

def get_default_value(field_name):
    """
    Get default value for a field.
    
    Args:
        field_name: Name of the field
    
    Returns:
        Default value or None
    """
    # Check MANIFEST_SCHEMA first
    schema = get_field_schema(field_name)
    if schema and 'default' in schema:
        return schema['default']
    
    # Fall back to MANIFEST_DEFAULTS
    return MANIFEST_DEFAULTS.get(field_name)

def get_valid_values(field_name):
    """
    Get list of valid values for enum fields.
    
    Args:
        field_name: Name of the field
    
    Returns:
        List of valid values or None
    """
    schema = get_field_schema(field_name)
    if schema and schema.get('type') == 'enum':
        return schema.get('constraints', {}).get('values', [])
    
    # Check for list item values
    if schema and schema.get('type') == 'list':
        if schema.get('constraints', {}).get('item_type') == 'enum':
            return schema['constraints'].get('item_values', [])
    
    return None

def is_field_required(field_name, manifest=None):
    """
    Check if a field is required.
    
    Args:
        field_name: Name of the field
        manifest: Optional manifest dict for conditional checks
    
    Returns:
        True if field is required
    """
    schema = get_field_schema(field_name)
    if not schema:
        return False
    
    if schema.get('required', False):
        return True
    
    # Check conditional requirements
    if manifest and 'condition' in schema:
        condition = schema['condition']
        if 'appType' in condition:
            app_type = manifest.get('appType', '')
            if app_type in condition:
                return True
    
    return False

def is_field_deprecated(field_name):
    """
    Check if a field is deprecated.
    
    Args:
        field_name: Name of the field
    
    Returns:
        True if field is deprecated
    """
    schema = get_field_schema(field_name)
    if schema:
        return schema.get('deprecated', False)
    return False

def get_all_field_names():
    """
    Get list of all field names in schema.
    
    Returns:
        List of field names
    """
    return list(MANIFEST_SCHEMA.keys())

def get_field_type(field_name):
    """
    Get the type of a field.
    
    Args:
        field_name: Name of the field
    
    Returns:
        Field type string or None
    """
    schema = get_field_schema(field_name)
    if schema:
        return schema.get('type')
    return None

# Export schema utilities
ManifestSchema = struct(
    MANIFEST_SCHEMA=MANIFEST_SCHEMA,
    FIELD_TYPES=FIELD_TYPES,
    CROSS_FIELD_CONSTRAINTS=CROSS_FIELD_CONSTRAINTS,
    SCHEMA_CONSTRAINTS=SCHEMA_CONSTRAINTS,
    get_field=get_field_schema,
    get_required_fields=get_required_fields,
    get_constraints=get_field_constraints,
    get_default=get_default_value,
    get_valid_values=get_valid_values,
    is_required=is_field_required,
    is_deprecated=is_field_deprecated,
    get_all_fields=get_all_field_names,
    get_type=get_field_type,
)

VALIDATION = {}
