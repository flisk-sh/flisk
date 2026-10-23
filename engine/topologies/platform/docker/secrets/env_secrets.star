# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔑 SECRETS FROM THE PROJECT .env
# =============================================================================
# Purpose: Make `secrets.required` / `secrets.optional` in service.json real for local development.
#
# The default provider is `env-file`: a secret's value lives in the project `.env` (gitignored) and reaches the container through
# Docker Compose's own `${NAME}` interpolation, so nothing secret is ever written to a generated, committed file. A required secret
# uses `${NAME:?message}`, so Compose refuses to start the service when the name is missing; an optional one defaults to empty.
#
# `TDK_SECRET_PROVIDER=infisical` leaves the names to Infisical instead, and nothing is injected here.
# =============================================================================

DEFAULT_SECRET_PROVIDER = 'env-file'

_NAME_FIRST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_'
_NAME_REST = _NAME_FIRST + '0123456789'


def get_secret_provider():
    """The selected provider: `env-file` (default) or `infisical`."""
    provider = str(os.environ.get('TDK_SECRET_PROVIDER', '')).strip().lower()
    return provider if provider else DEFAULT_SECRET_PROVIDER


def _is_valid_env_name(name):
    if type(name) != 'string' or not name:
        return False
    if name[0] not in _NAME_FIRST:
        return False
    for i in range(len(name)):
        if name[i] not in _NAME_REST:
            return False
    return True


def _names(manifest, resource_name, kind):
    secrets = manifest.get('secrets') or {}
    names = secrets.get(kind) or []
    if type(names) != 'list':
        fail("{}: secrets.{} must be a list of environment variable names".format(resource_name, kind))
    for name in names:
        if not _is_valid_env_name(name):
            fail("{}: invalid secret name '{}' in secrets.{}: use letters, digits and underscores, not starting with a digit".format(resource_name, name, kind))
    return names


def get_secret_environment_lines(manifest, resource_name):
    """Compose `environment:` list lines (each starting with a newline) for a resource's secrets, or '' when there are none.

    Args:
        manifest: The service manifest (reads secrets.required and secrets.optional)
        resource_name: Used in error messages and in the text Compose shows for a missing required secret

    Returns:
        str: Lines to append to the Compose environment block
    """
    if not manifest or not manifest.get('secrets'):
        return ''

    required = _names(manifest, resource_name, 'required')
    optional = _names(manifest, resource_name, 'optional')

    if get_secret_provider() != DEFAULT_SECRET_PROVIDER:
        return ''

    lines = ''
    for name in required:
        lines += '\n      - {name}=${{{name}:?{name} is required by {resource}. Add it to the project .env}}'.format(name=name, resource=resource_name)
    for name in optional:
        if name not in required:
            lines += '\n      - {name}=${{{name}:-}}'.format(name=name)
    return lines
