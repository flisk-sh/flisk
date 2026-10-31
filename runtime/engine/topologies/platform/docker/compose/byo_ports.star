# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# Extra published ports for a bring-your-own resource (service.json `extraPorts`, #2909).
# `port` stays the one Flisk health-checks and routes through Traefik. A reverse proxy (Caddy on 80 and 443) or a service with a
# second listener (a SOCKS proxy next to HTTP) also needs plain host ports. They are published on 127.0.0.1 only, so nothing is
# reachable from the network, and the host port defaults to the container port. Keep in step with extraPortsErrors in
# cli/src/utils/service-manifest.ts and extraPortsOf in cli/src/utils/status-ports.ts. This file has no load() on purpose.
# =============================================================================

_PROTOCOLS = ["tcp", "udp"]


def _port_number(value, field):
    if type(value) != "int" or value < 1 or value > 65535:
        fail("MANIFEST ERROR: '{}' must be a port number from 1 to 65535".format(field))
    return value


def byo_extra_ports(manifest):
    """The Compose `ports:` section for service.json `extraPorts`, indented for a service entry, or "" when there are none.

    Only bring-your-own resources publish extra ports, and only one container: replicas would all ask for the same host port.
    """
    extra = manifest.get('extraPorts') if manifest else None
    if extra == None or manifest.get('appType') != 'bring-your-own':
        return ""
    if type(extra) != "list":
        fail("MANIFEST ERROR: 'extraPorts' must be a list such as [{\"port\": 443}]")
    if extra and manifest.get('replicas', 1) != 1:
        fail("MANIFEST ERROR: 'extraPorts' needs a single container; remove 'replicas'")

    lines = []
    seen = []
    for i, entry in enumerate(extra):
        field = "extraPorts[{}]".format(i)
        if type(entry) != "dict":
            fail("MANIFEST ERROR: '{}' must be an object such as {{\"port\": 443}}".format(field))
        port = _port_number(entry.get('port'), field + ".port")
        host_port = _port_number(entry.get('hostPort', port), field + ".hostPort")
        protocol = entry.get('protocol', 'tcp')
        if protocol not in _PROTOCOLS:
            fail("MANIFEST ERROR: '{}.protocol' must be tcp or udp".format(field))
        key = "{}/{}".format(host_port, protocol)
        if key in seen:
            fail("MANIFEST ERROR: '{}.hostPort' {} is published twice".format(field, key))
        seen.append(key)
        lines.append('      - "127.0.0.1:{}:{}/{}"'.format(host_port, port, protocol))

    if not lines:
        return ""
    return "    ports:\n" + "\n".join(lines) + "\n"
