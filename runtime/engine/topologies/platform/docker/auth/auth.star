# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔐 TILT SDK - AUTH CONFIGURATION UTILITIES
# =============================================================================
# Path: .tilt/topologies/platform/docker/auth.star
# Purpose: Centralized authentication configuration helpers for docker-compose
#          and environment file generation across the platform.
# 
# Design Principle: This module is decoupled from manifest.json structure.
#          It accepts auth configuration as a dictionary parameter and does
#          not know where the config comes from. Callers (env.star, compose.star)
#          are responsible for extracting auth fields from manifest and passing
#          them as the auth_config dict.
# =============================================================================

# Default values for auth configuration.
#
# There is deliberately no default JWT secret: a secret that is the same in every project is not a secret. The JWT secret is
# generated once per project by the CLI into the project `.env` (JWT_SECRET) and Compose reads it from there.
DEFAULT_AUTH_MODE = 'local-jwt'
DEFAULT_IDENTITY_RESOURCE_URL = 'http://identity-service:3000'

# Shown by Compose when the project `.env` has no JWT_SECRET.
JWT_SECRET_MISSING_MESSAGE = 'JWT_SECRET is not set. Run `flisk up` (it adds a generated one to the project .env) or add JWT_SECRET to .env'


def _setting(auth_config, key, default):
    """A configured value, or the default when the key is missing OR present with a None value.

    Callers build the config dict with every key present and None for anything unset, and `dict.get(key, default)` returns that
    None instead of the default, which used to turn into the literal text `AUTH_MODE=None` in generated files.
    """
    if not auth_config:
        return default
    value = auth_config.get(key)
    if value == None or value == '':
        return default
    return value


def _first_set(*values):
    """The first value that is not None or an empty string, else None."""
    for value in values:
        if value != None and value != '':
            return value
    return None


def auth_config_from_manifest(manifest):
    """Build the auth configuration both the env file and the Compose entry use, from one place.

    The two writers used to build this separately and drifted: the env file read `identityServiceUrl` while Compose read
    `envVars.IDENTITY_RESOURCE_URL`, so setting one field changed only one output.

    - authMode: the manifest's `authMode`, else `identity-service` when `dependsOn` contains `identity`, else unset (local-jwt).
    - identityServiceUrl: the manifest's `identityServiceUrl`. The deprecated `params` / `envVars` entry named
      `IDENTITY_RESOURCE_URL` is still honoured when the field is absent, so an existing manifest keeps working.

    Args:
        manifest: The service manifest dict (may be None)

    Returns:
        dict: {'authMode': str or None, 'identityServiceUrl': str or None}; None means "use the default"
    """
    if not manifest:
        return {'authMode': None, 'identityServiceUrl': None}

    auth_mode = _first_set(
        manifest.get('authMode'),
        'identity-service' if 'identity' in (manifest.get('dependsOn') or []) else None,
    )
    identity_url = _first_set(
        manifest.get('identityServiceUrl'),
        (manifest.get('params') or {}).get('IDENTITY_RESOURCE_URL'),
        (manifest.get('envVars') or {}).get('IDENTITY_RESOURCE_URL'),
    )
    return {'authMode': auth_mode, 'identityServiceUrl': identity_url}


def get_auth_mode(auth_config):
    """Get auth mode from auth config with default fallback.

    Args:
        auth_config: Auth configuration dictionary (may be None or empty)

    Returns:
        str: Auth mode ('local-jwt' or 'identity-service')
    """
    return _setting(auth_config, 'authMode', DEFAULT_AUTH_MODE)


def get_identity_resource_url(auth_config):
    """Get identity service URL from auth config with default fallback.

    Args:
        auth_config: Auth configuration dictionary (may be None or empty)

    Returns:
        str: URL for identity service
    """
    return _setting(auth_config, 'identityServiceUrl', DEFAULT_IDENTITY_RESOURCE_URL)


def get_auth_config(auth_config):
    """Get complete auth configuration from auth config dict.

    Args:
        auth_config: Auth configuration dictionary (may be None or empty)

    Returns:
        struct: Auth configuration with mode and identity_resource_url (the JWT secret lives in the project .env, not here)
    """
    return struct(
        mode = get_auth_mode(auth_config),
        identity_resource_url = get_identity_resource_url(auth_config),
    )


def is_local_jwt_mode(auth_config):
    """Check if auth mode is local-jwt.

    Args:
        auth_config: Auth configuration dictionary (may be None or empty)

    Returns:
        bool: True if auth mode is 'local-jwt'
    """
    return get_auth_mode(auth_config) == 'local-jwt'


def is_identity_resource_mode(auth_config):
    """Check if auth mode is identity-service.

    Args:
        auth_config: Auth configuration dictionary (may be None or empty)

    Returns:
        bool: True if auth mode is 'identity-service'
    """
    return get_auth_mode(auth_config) == 'identity-service'


def generate_docker_compose_auth_env(auth_config):
    """Generate docker-compose environment variables for auth configuration.

    This function returns the properly formatted environment variable block
    for docker-compose.yml files based on the auth mode.

    Args:
        auth_config: Auth configuration dictionary (may be None or empty)

    Returns:
        str: Formatted auth environment variables for docker-compose
    """
    auth_mode = get_auth_mode(auth_config)
    identity_resource_url = get_identity_resource_url(auth_config)

    if auth_mode == 'local-jwt':
        # Required from the project .env (see JWT_SECRET_MISSING_MESSAGE); there is no shared default.
        return """      - AUTH_MODE=local-jwt
      - JWT_SECRET=${JWT_SECRET:?%(message)s}""" % {'message': JWT_SECRET_MISSING_MESSAGE}
    else:
        return """      - AUTH_MODE=identity-service
      - IDENTITY_RESOURCE_URL=${IDENTITY_RESOURCE_URL:-%(identity_resource_url)s}""" % {'identity_resource_url': identity_resource_url}


def generate_env_file_auth_section(auth_config):
    """Generate .env file auth section content.

    This function returns the formatted authentication configuration section
    for .env.backend.autogenerated files. These files are generated, checked by
    `flisk config verify` and never carry secrets, so there is no JWT secret here:
    in local-jwt mode Compose takes JWT_SECRET from the project .env.

    Args:
        auth_config: Auth configuration dictionary (may be None or empty)

    Returns:
        str: Formatted auth section for .env files
    """
    auth_mode = get_auth_mode(auth_config)
    identity_resource_url = get_identity_resource_url(auth_config)

    content = """
# Authentication Configuration
# Mode: {auth_mode} (options: local-jwt, identity-service)
AUTH_MODE={auth_mode}
""".format(auth_mode=auth_mode)

    if auth_mode != 'local-jwt':
        content += "IDENTITY_RESOURCE_URL={identity_resource_url}\n".format(identity_resource_url=identity_resource_url)

    return content


# Export all functions as a struct for easy importing
AuthConfig = struct(
    from_manifest = auth_config_from_manifest,
    get_auth_mode = get_auth_mode,
    get_identity_resource_url = get_identity_resource_url,
    get_auth_config = get_auth_config,
    is_local_jwt_mode = is_local_jwt_mode,
    is_identity_resource_mode = is_identity_resource_mode,
    generate_docker_compose_auth_env = generate_docker_compose_auth_env,
    generate_env_file_auth_section = generate_env_file_auth_section,
)
