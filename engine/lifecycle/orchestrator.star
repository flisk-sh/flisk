# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔄 TILT LIFECYCLE - SERVICE STARTUP ORCHESTRATOR
# =============================================================================
# Path: .tilt/lifecycle/orchestrator.star
# Purpose: Service startup sequencing and grace period management
# =============================================================================
#
# This module implements Story 4 - Fix API Gateway 504 Errors:
# - Service startup sequencing
# - 30-second grace period configuration
# - Proper health check orchestration
# - Zero 504 errors on startup
#
# =============================================================================

# === INLINED CONSTANTS for pure extension loading ===
HEALTH_CHECK_PATH = "/health"
# === END INLINED CONSTANTS ===


load('../topologies/platform/docker/networking/traefik_constants.star',
    'TRAEFIK_STARTUP_GRACE_PERIOD',
    'TRAEFIK_RESOURCE_STARTUP_DELAY',
    'TRAEFIK_HEALTHY_THRESHOLD',
    'TRAEFIK_HEALTHCHECK_INTERVAL',
    'TRAEFIK_HEALTHCHECK_TIMEOUT',
    'TRAEFIK_HEALTHCHECK_RETRIES',
)


# =============================================================================
# 📋 STARTUP SEQUENCING CONFIGURATION
# =============================================================================

# Service startup phases - ensure infrastructure is ready before apps
STARTUP_PHASES = {
    'infra': [
        'TDK_postgres',
        'TDK_nats',
        'TDK_infisical',
        'verdaccio',
    ],
    'proxy': [
        'TDK_traefik',
        'TDK_dashy',
    ],
    'migrators': [],  # Populated dynamically based on enabled services
    'apps': [],       # Populated dynamically based on enabled services
}

# Grace period configuration for each service type
GRACE_PERIOD_CONFIG = {
    'backend': {
        'start_period': '60s',      # Time before health checks begin
        'interval': '10s',          # Health check interval
        'timeout': '5s',            # Health check timeout
        'retries': 6,               # Retries before marking unhealthy
        'startup_delay': '10s',       # Delay before service receives traffic
    },
    'frontend': {
        'start_period': '30s',
        'interval': '10s',
        'timeout': '5s',
        'retries': 3,
        'startup_delay': '5s',
    },
    'infra': {
        'start_period': '30s',
        'interval': '5s',
        'timeout': '5s',
        'retries': 10,
        'startup_delay': '5s',
    },
}

# =============================================================================
# 🚀 STARTUP SEQUENCING FUNCTIONS
# =============================================================================

def get_resource_phase(resource_name, resource_config):
    """Determine which startup phase a service belongs to."""
    # Check if it's an infrastructure service
    if resource_name in STARTUP_PHASES['infra']:
        return 'infra'
    
    # Check if it's a proxy service
    if resource_name in STARTUP_PHASES['proxy']:
        return 'proxy'
    
    # Check if service has migrator
    resources = resource_config.get('resources', [])
    for res in resources:
        if 'migrator' in res.get('name', ''):
            return 'migrators'
    
    # Default to apps
    return 'apps'


def get_grace_period_config(resource_type):
    """Get grace period configuration for a service type."""
    return GRACE_PERIOD_CONFIG.get(resource_type, GRACE_PERIOD_CONFIG['backend'])


def calculate_total_startup_time(resource_type):
    """
    Calculate total time for a service to be considered healthy.
    Formula: start_period + (retries * interval) + buffer
    """
    config = get_grace_period_config(resource_type)
    start_period_seconds = _parse_duration(config['start_period'])
    interval_seconds = _parse_duration(config['interval'])
    retries = config['retries']
    
    # Total time = start_period + (retries * interval) + 5s buffer
    total_seconds = start_period_seconds + (retries * interval_seconds) + 5
    return total_seconds


def _parse_duration(duration_str):
    """Parse duration string (e.g., '60s', '5m') to seconds."""
    if not duration_str:
        return 0
    
    duration_str = str(duration_str).strip().lower()
    
    if duration_str.endswith('s'):
        return int(duration_str[:-1])
    elif duration_str.endswith('m'):
        return int(duration_str[:-1]) * 60
    elif duration_str.endswith('h'):
        return int(duration_str[:-1]) * 3600
    else:
        # Assume seconds if no unit
        return int(duration_str)


# =============================================================================
# 🔍 HEALTH CHECK ORCHESTRATION
# =============================================================================

def get_health_check_config(resource_name, resource_type='backend', port=3000):
    """
    Generate health check configuration for a service.
    Ensures proper sequencing to prevent 504 errors.
    """
    config = get_grace_period_config(resource_type)
    
    return {
        'test': ['CMD', 'curl', '-f', '--max-time', '5', 
                 'http://localhost:' + str(port) + '/health'],
        'interval': config['interval'],
        'timeout': config['timeout'],
        'retries': config['retries'],
        'start_period': config['start_period'],
        'disable': False,
    }


def get_traefik_health_check_labels(resource_name, health_path=HEALTH_CHECK_PATH):
    """
    Generate Traefik health check labels for load balancer.
    These ensure Traefik only routes to healthy services.
    """
    return {
        'traefik.http.services.{}.loadbalancer.healthcheck.path'.format(resource_name): health_path,
        'traefik.http.services.{}.loadbalancer.healthcheck.interval'.format(resource_name): TRAEFIK_HEALTHCHECK_INTERVAL,
        'traefik.http.services.{}.loadbalancer.healthcheck.timeout'.format(resource_name): TRAEFIK_HEALTHCHECK_TIMEOUT,
        # Disable health check initially during startup grace period
        'traefik.http.services.{}.loadbalancer.healthcheck.disable'.format(resource_name): 'false',
    }


# =============================================================================
# ⏱️ STARTUP DELAY AND SYNCHRONIZATION
# =============================================================================

def get_startup_delay(resource_type='backend'):
    """Get the startup delay for a service type before it receives traffic."""
    config = get_grace_period_config(resource_type)
    return config['startup_delay']


def should_wait_for_dependencies(resource_config):
    """
    Determine if a service should wait for dependencies before starting.
    Returns list of dependencies to wait for.
    """
    dependencies = []
    
    # Check for database dependency
    resources = resource_config.get('resources', [])
    for res in resources:
        manifest = res.get('_manifest', {})
        features = manifest.get('featuresEnabled', [])
        if manifest.get('databaseName') or 'prisma' in features or 'drizzle' in features:
            dependencies.append('database-management')
            break

    # Check for NATS dependency
    for res in resources:
        manifest = res.get('_manifest', {})
        if 'nats' in manifest.get('featuresEnabled', []):
            dependencies.append('messaging')
            break
    
    return dependencies


# =============================================================================
# 🎯 SERVICE READINESS CHECKS
# =============================================================================

def is_resource_ready(resource_name, resource_config):
    """
    Check if a service is ready to receive traffic.
    Used by Tilt resource_deps to sequence service startup.
    """
    phase = get_resource_phase(resource_name, resource_config)
    
    # Infrastructure services must be healthy first
    if phase == 'infra':
        return True  # These are handled by docker-compose health checks
    
    # Proxy services depend on infra
    if phase == 'proxy':
        return 'infra'  # Wait for infra phase
    
    # Migrators depend on database
    if phase == 'migrators':
        return 'database-management'
    
    # Apps depend on their migrators and infrastructure
    return 'migrators'  # Wait for migrators


# =============================================================================
# 📊 ORCHESTRATOR PUBLIC API
# =============================================================================

Orchestrator = struct(
    # Phase detection
    get_resource_phase=get_resource_phase,
    
    # Grace period configuration
    get_grace_period_config=get_grace_period_config,
    calculate_total_startup_time=calculate_total_startup_time,
    
    # Health check configuration
    get_health_check_config=get_health_check_config,
    get_traefik_health_check_labels=get_traefik_health_check_labels,
    
    # Startup synchronization
    get_startup_delay=get_startup_delay,
    should_wait_for_dependencies=should_wait_for_dependencies,
    is_resource_ready=is_resource_ready,
    
    # Constants
    STARTUP_PHASES=STARTUP_PHASES,
    GRACE_PERIOD_CONFIG=GRACE_PERIOD_CONFIG,
)
