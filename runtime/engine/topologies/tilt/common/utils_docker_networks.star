# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🐳 TILT SDK - DOCKER NETWORK MANAGEMENT
# =============================================================================


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
