# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📋 MANIFEST MODULE - FIELD MAPPER
# =============================================================================
# Path: .tilt/topologies/tilt/manifest/mapper.star
# Purpose: Decouple internal field names from manifest field names
# 
# This is the MAGIC LAYER - change field names in manifests without changing code!
# 
# Example:
#   Internal code uses: manifest['port']
#   YAML manifest has:   spec.portNewNameOfAttr: 4002
#   Mapper converts:     portNewNameOfAttr → port
# =============================================================================

# ============================================================================
# FIELD NAME MAPPINGS
# ============================================================================
# KEY: Internal field name (what code expects)
# VALUE: List of possible manifest field names (tries first match)
# ============================================================================

FIELD_MAPPINGS = {
    # Core application fields
    'appName': ['appName'],
    'appType': ['appType'],
    'stack': ['stack', 'stack', 'metadata.stack', 'metadata.domain', 'namespace', 'app.stack', 'app.domain'],
    'port': ['port', 'portNewNameOfAttr', 'spec.port', 'metadata.port', 'servicePort', 'app.port'],
    
    # Runtime fields
    'runtime': ['runtime', 'engine', 'spec.runtime', 'app.runtime'],
    'replicas': ['replicas', 'instances', 'count', 'spec.replicas', 'metadata.replicas'],
    
    # Feature flags
    'featuresEnabled': ['featuresEnabled', 'capabilities', 'spec.features', 'enabledFeatures', 'app.features'],
    
    # Dependencies
    'dependsOn': [
        'dependsOn',
        'dependencies.internal',
        'spec.dependencies.internal',
        'requires'
    ],
    'externalDependencies': [
        'externalDependencies',
        'dependencies.external', 
        'spec.dependencies.external'
    ],
    
    # Environment
    'envVars': ['envVars', 'env', 'environment', 'spec.envVars', 'environmentVariables', 'app.env'],
    
    # Database
    'databaseName': ['databaseName', 'database.name', 'dbName', 'spec.database.name', 'db'],
    
    # Traefik/Gateway
    'traefik': ['traefik', 'gateway', 'ingress', 'spec.traefik', 'routing'],
    
    # Docker/Build
    'dockerfile': ['dockerfile', 'docker.file', 'build.dockerfile', 'spec.build.dockerfile'],
    'buildContext': ['buildContext', 'docker.context', 'build.context', 'spec.build.context'],
    
    # Frontend specific
    'backendName': ['backendName', 'backend', 'spec.backendName', 'proxyTo', 'app.backend'],
    'basePath': ['basePath', 'base', 'path', 'spec.basePath', 'app.basePath'],
}

# ============================================================================
# FIELD MAPPER FUNCTIONS
# ============================================================================

def get_field(manifest, internal_name, default=None):
    """
    Get a field value from manifest using internal field name.
    Automatically handles field name mapping!
    
    Args:
        manifest: Dict (from JSON or normalized YAML)
        internal_name: Internal field name (e.g., 'port', 'appName')
        default: Default value if field not found
        
    Returns:
        Field value or default
        
    Example:
        # Manifest has: {portNewNameOfAttr: 4002}
        # Code calls:  get_field(manifest, 'port', 4000)
        # Returns:     4002
    """
    # Get list of possible field names for this internal field
    possible_names = FIELD_MAPPINGS.get(internal_name, [internal_name])
    
    # Try each possible name
    for field_name in possible_names:
        value = _get_nested_field(manifest, field_name)
        if value != None:
            return value
    
    return default


def _get_nested_field(manifest, field_path):
    """
    Get a potentially nested field value.
    
    Supports:
      - Simple field: 'port'
    - Nested field: 'metadata.stack'
      - Deep nested: 'spec.dependencies.internal'
    """
    if '.' not in field_path:
        # Simple field
        return manifest.get(field_path)
    
    # Nested field - traverse path
    parts = field_path.split('.')
    current = manifest
    
    for part in parts:
        if type(current) == "dict" and part in current:
            current = current[part]
        else:
            return None
    
    return current


def set_field(manifest, internal_name, value):
    """
    Set a field value using internal field name.
    Creates the field at the primary mapping location.
    
    Args:
        manifest: Dict to modify
        internal_name: Internal field name
        value: Value to set
        
    Returns:
        Modified manifest
    """
    possible_names = FIELD_MAPPINGS.get(internal_name, [internal_name])
    primary_name = possible_names[0]  # Use first mapping as primary
    
    manifest[primary_name] = value
    return manifest


def get_all_fields(manifest):
    """
    Extract all mapped fields from manifest.
    Returns normalized dict with internal field names.
    
    This is the MAGIC FUNCTION - pass it any manifest format
    (JSON, YAML, old format, new format) and get consistent output!
    """
    result = {}
    
    for internal_name in FIELD_MAPPINGS:
        value = get_field(manifest, internal_name)
        if value != None:
            result[internal_name] = value
    
    return result


def map_manifest(manifest, target_format='internal'):
    """
    Map manifest from any format to target format.
    
    Args:
        manifest: Input manifest (JSON, YAML, old, new)
        target_format: 'internal' (standardized) or 'yaml' (hierarchical)
        
    Returns:
        Mapped manifest in target format
    """
    if target_format == 'internal':
        # Map to internal standard format
        return get_all_fields(manifest)
    
    elif target_format == 'yaml':
        # Map to YAML hierarchical format
        internal = get_all_fields(manifest)
        return _to_yaml_format(internal)
    
    return manifest


def _to_yaml_format(internal_manifest):
    """Convert internal format to YAML hierarchical format."""
    return {
        'apiVersion': 'tilt.Flisk Landscape.io/v1',
        'kind': 'ResourceManifest',
        'metadata': {
            'name': internal_manifest.get('appName', ''),
            'stack': internal_manifest.get('stack', ''),
        },
        'spec': {
            'appType': internal_manifest.get('appType', 'backend'),
            'port': internal_manifest.get('port', 4000),
            'runtime': internal_manifest.get('runtime', 'bun'),
            'replicas': internal_manifest.get('replicas', 1),
            'featuresEnabled': internal_manifest.get('featuresEnabled', []),
            'envVars': internal_manifest.get('envVars', {}),
            'dependencies': {
                'internal': internal_manifest.get('dependsOn', []),
                'external': internal_manifest.get('externalDependencies', []),
            },
            'database': {
                'name': internal_manifest.get('databaseName', ''),
            } if internal_manifest.get('databaseName') else None,
            'gateway': internal_manifest.get('traefik', {}),
        }
    }


# ============================================================================
# PUBLIC API
# ============================================================================

ManifestMapper = struct(
    get=get_field,
    set=set_field,
    get_all=get_all_fields,
    map=map_manifest,
    # Expose mappings for debugging
    mappings=FIELD_MAPPINGS,
)
