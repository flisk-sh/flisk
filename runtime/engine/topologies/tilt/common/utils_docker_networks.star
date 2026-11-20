# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🐳 TILT SDK - DOCKER NETWORK MANAGEMENT
# =============================================================================

_NET_NAME_FIRST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
_NET_NAME_REST = _NET_NAME_FIRST + '_.-'
_VAR_NAME_FIRST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_'
_VAR_NAME_REST = _VAR_NAME_FIRST + '0123456789'


def _is_safe_network_name(name):
    """True when `name` is a safe Docker network name (alphanumeric, `_`, `.`, `-`, no shell metacharacters)."""
    if type(name) != 'string' or not name:
        return False
    if name[0] not in _NET_NAME_FIRST:
        return False
    for i in range(len(name)):
        if name[i] not in _NET_NAME_REST:
            return False
    return True


def _is_var_name(name):
    if not name or name[0] not in _VAR_NAME_FIRST:
        return False
    for i in range(len(name)):
        if name[i] not in _VAR_NAME_REST:
            return False
    return True


def _expand_compose_vars(value, env=None):
    """Expand Docker Compose `${VAR}`, `${VAR:-default}`, `${VAR-default}`, `$VAR` and `$$` syntax."""
    if '$' not in value:
        return value
    lookup = os.environ if env == None else env
    out = []
    i = 0
    n = len(value)
    while i < n:
        ch = value[i]
        if ch != '$':
            out.append(ch)
            i += 1
            continue
        if i + 1 < n and value[i + 1] == '$':
            out.append('$')
            i += 2
            continue
        if i + 1 < n and value[i + 1] == '{':
            close = value.find('}', i + 2)
            if close == -1:
                out.append(ch)
                i += 1
                continue
            expr = value[i + 2:close]
            sep_idx = expr.find(':-')
            if sep_idx > 0:
                var_name = expr[:sep_idx]
                default_val = expr[sep_idx + 2:]
                if _is_var_name(var_name):
                    val = lookup.get(var_name, '')
                    out.append(val if val else default_val)
                    i = close + 1
                    continue
            else:
                dash_idx = expr.find('-')
                if dash_idx > 0:
                    var_name = expr[:dash_idx]
                    default_val = expr[dash_idx + 1:]
                    if _is_var_name(var_name):
                        out.append(lookup[var_name] if var_name in lookup else default_val)
                        i = close + 1
                        continue
                elif _is_var_name(expr):
                    out.append(lookup.get(expr, ''))
                    i = close + 1
                    continue
            out.append(value[i:close + 1])
            i = close + 1
            continue
        if i + 1 < n and value[i + 1] in _VAR_NAME_FIRST:
            j = i + 2
            while j < n and value[j] in _VAR_NAME_REST:
                j += 1
            var_name = value[i + 1:j]
            out.append(lookup.get(var_name, ''))
            i = j
            continue
        out.append(ch)
        i += 1
    return ''.join(out)


def external_compose_networks(compose_files, project_prefix, env=None, read_yaml_fn=None):
    """Scan Compose YAML files and return sorted `<project_prefix>*` networks declared `external: true`.

    Supports both Compose Spec (`external: true` with optional `name:`) and legacy v2/v3
    (`external: { name: ... }`). Only names prefixed with `project_prefix` that pass Docker
    network-name safety checks are returned, so unrelated external networks and unsafe strings
    are never passed to `docker network create`.
    """
    if not compose_files or not project_prefix:
        return []
    reader = read_yaml if read_yaml_fn == None else read_yaml_fn
    found = []
    for path in compose_files:
        doc = reader(path, default={})
        if type(doc) != 'dict':
            continue
        networks = doc.get('networks', {})
        if type(networks) != 'dict':
            continue
        for net_key, net_def in networks.items():
            if type(net_def) != 'dict':
                continue
            ext = net_def.get('external', False)
            if type(ext) == 'bool' and ext:
                explicit = net_def.get('name', '')
                raw_name = str(explicit) if explicit else str(net_key)
            elif type(ext) == 'dict':
                explicit = ext.get('name', '') or net_def.get('name', '')
                raw_name = str(explicit) if explicit else str(net_key)
            else:
                continue
            resolved = _expand_compose_vars(raw_name.strip(), env)
            if not resolved.startswith(project_prefix) or len(resolved) <= len(project_prefix):
                continue
            if not _is_safe_network_name(resolved):
                continue
            if resolved not in found:
                found.append(resolved)
    return sorted(found)


def fix_docker_networks(platform_networks):
    """
    Generates a shell command that:
    1. Removes networks with incorrect labels (if they exist and are not in use)
    2. Creates all platform networks if they don't exist, and fails with Docker's own
       error if one that does not exist cannot be created
    """
    commands = []
    commands.append('echo "Initializing Docker networks..."')

    for network in platform_networks:
        check_and_remove = '(docker network inspect ' + network + ' >/dev/null 2>&1 && '
        check_and_remove += 'docker network inspect ' + network + ' --format "{{.Labels}}" | grep -q "com.docker.compose" && '
        check_and_remove += 'echo "Removing network ' + network + ' with incorrect labels..." && '
        check_and_remove += 'docker network rm ' + network + ' 2>/dev/null) || true'
        commands.append(check_and_remove)

        # Create the network. A failed create is an error unless the network exists
        # afterwards (already there, or another process created it first). Docker's own
        # message is printed and the command exits non-zero, so Tilt marks init-networks failed.
        create_cmd = 'if _out=$(docker network create ' + network + ' 2>&1); then echo "Created network ' + network + '"; '
        create_cmd += 'elif docker network inspect ' + network + ' >/dev/null 2>&1; then :; '
        create_cmd += 'else echo "Failed to create Docker network ' + network + ': $_out" >&2; exit 1; fi'
        commands.append(create_cmd)

    commands.append('echo "Docker networks initialized"')

    return ' && '.join(commands)


def cleanup_docker_networks(platform_networks):
    """
    Generates a shell command to forcefully remove all platform networks.
    WARNING: This will disconnect all containers from these networks first!
    """
    commands = []
    commands.append('echo "Cleaning up Docker networks..."')

    for network in platform_networks:
        disconnect_cmd = 'for c in $(docker network inspect ' + network + ' -f "{{range .Containers}}{{.Name}} {{end}}" 2>/dev/null); do '
        disconnect_cmd += 'docker network disconnect -f ' + network + ' "$c" 2>/dev/null || true; done'
        commands.append(disconnect_cmd)
        commands.append('docker network rm ' + network + ' 2>/dev/null || true')

    commands.append('echo "Docker networks cleaned up"')

    return ' && '.join(commands)
