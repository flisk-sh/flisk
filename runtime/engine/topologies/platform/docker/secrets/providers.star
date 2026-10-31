# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🔌 EXTERNAL PROVIDERS (service.json `providers`)
# =============================================================================
# Purpose: Declare a cloud endpoint a service calls (IBM Quantum, Amazon Braket, IonQ, a hosted model API) next to its token,
# and optionally a local resource to use instead while the token is missing (a simulator, an emulator, a local model server).
#
# For provider `ibm-quantum` the service gets:
#   PROVIDER_IBM_QUANTUM_URL            the remote endpoint (generated env file; not a secret)
#   PROVIDER_IBM_QUANTUM_FALLBACK_URL   http://<fallback>:<port> when `fallback` is set (generated env file)
#   <tokenSecret>                       the token, from the project .env like `secrets` (Compose interpolation, never written out)
#   PROVIDER_IBM_QUANTUM_REMOTE         "true" when the token has a value, empty otherwise (Compose `${NAME:+true}`)
# so the code picks the remote endpoint or the local one at start, and a token added to (or removed from) .env takes effect
# when the container is recreated. A provider with a fallback has an optional token; without one the token is required.
# Keep in step with providersErrors in cli/src/utils/service-manifest.ts. This file has no load() on purpose: env.star and
# compose.star pass in what they need.
# =============================================================================

_ID_FIRST = 'abcdefghijklmnopqrstuvwxyz'
_ID_CHARS = _ID_FIRST + '0123456789-'
_NAME_FIRST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_'
_NAME_CHARS = _NAME_FIRST + '0123456789'
_URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-./:@%+=,~'
_KEYS = ['url', 'tokenSecret', 'fallback', 'required']


def _only(value, first, chars):
    if type(value) != 'string' or not value or value[0] not in first:
        return False
    for c in value.elems():
        if c not in chars:
            return False
    return True


def _env_key(provider_id):
    return 'PROVIDER_' + provider_id.upper().replace('-', '_')


def manifest_providers(manifest):
    """The validated `providers` of a manifest: a list of struct(id, key, url, token, fallback, required), sorted by id."""
    providers = manifest.get('providers') if manifest else None
    if providers == None:
        return []
    if type(providers) != 'dict':
        fail("MANIFEST ERROR: 'providers' must be an object such as {\"ibm-quantum\": {\"url\": \"https://...\"}}")
    result = []
    for provider_id in sorted(providers.keys()):
        entry = providers[provider_id]
        field = "providers.{}".format(provider_id)
        if not _only(provider_id, _ID_FIRST, _ID_CHARS):
            fail("MANIFEST ERROR: '{}' must be named in lowercase letters, digits and '-', such as ibm-quantum".format(field))
        if type(entry) != 'dict':
            fail("MANIFEST ERROR: '{}' must be an object with a url".format(field))
        for key in entry.keys():
            if key not in _KEYS:
                fail("MANIFEST ERROR: '{}.{}' is not a provider setting (use {})".format(field, key, ", ".join(_KEYS)))
        url = entry.get('url')
        if not (_only(url, 'h', _URL_CHARS) and (url.startswith('https://') or url.startswith('http://'))):
            fail("MANIFEST ERROR: '{}.url' must be an http(s) URL without spaces, quotes or $".format(field))
        token = entry.get('tokenSecret')
        if token != None and not _only(token, _NAME_FIRST, _NAME_CHARS):
            fail("MANIFEST ERROR: '{}.tokenSecret' must be an environment variable name such as IBM_QUANTUM_TOKEN".format(field))
        fallback = entry.get('fallback')
        if fallback != None and not _only(fallback, _ID_FIRST, _ID_CHARS):
            fail("MANIFEST ERROR: '{}.fallback' must be a resource name such as quantum-sim".format(field))
        required = entry.get('required', token != None and fallback == None)
        if type(required) != 'bool':
            fail("MANIFEST ERROR: '{}.required' must be true or false".format(field))
        if required and token == None:
            fail("MANIFEST ERROR: '{}.required' needs a tokenSecret".format(field))
        result.append(struct(id = provider_id, key = _env_key(provider_id), url = url, token = token, fallback = fallback, required = required))
    return result


def provider_env_file_lines(manifest, fallback_port):
    """Lines for the generated env file: each provider's URL, and its fallback's URL.

    Args:
        manifest: the service.json
        fallback_port: function(resource name) -> the port the resource listens on, or None when no such resource exists
    """
    lines = ''
    for p in manifest_providers(manifest):
        lines += '{}_URL={}\n'.format(p.key, p.url)
        if p.fallback != None:
            port = fallback_port(p.fallback)
            if port == None:
                fail("MANIFEST ERROR: 'providers.{}.fallback' names {}, which is not a resource in this project".format(p.id, p.fallback))
            lines += '{}_FALLBACK_URL=http://{}:{}\n'.format(p.key, p.fallback, port)
    if not lines:
        return ''
    return '\n# External providers (service.json `providers`)\n' + lines


def provider_environment_lines(manifest, resource_name, inject_tokens):
    """Compose `environment:` lines (each starting with a newline): each provider's token and its _REMOTE flag.

    `inject_tokens` is False when another secret provider (Infisical) owns the values: the flag still follows the variable.
    """
    lines = ''
    for p in manifest_providers(manifest):
        if p.token == None:
            continue
        if inject_tokens:
            if p.required:
                lines += '\n      - {name}=${{{name}:?{name} is required by {resource} (provider {id}). Add it to the project .env}}'.format(name = p.token, resource = resource_name, id = p.id)
            else:
                lines += '\n      - {name}=${{{name}:-}}'.format(name = p.token)
        lines += '\n      - {key}_REMOTE=${{{name}:+true}}'.format(key = p.key, name = p.token)
    return lines
