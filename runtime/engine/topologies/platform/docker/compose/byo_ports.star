# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# Extra published ports for a bring-your-own resource (service.json `extraPorts`, #2909).
# `port` stays the one Flisk health-checks and routes through Traefik. A reverse proxy (Caddy on 80 and 443) or a service with a
# second listener (a SOCKS proxy next to HTTP) also needs plain host ports. They are published on 127.0.0.1 unless an entry opts
# in with "bind": "0.0.0.0", which a self-hosted app needs so phones and TVs on the same network can reach it. The host port
# defaults to the container port. An entry may give `publish` instead of `hostPort` and `bind`: the host side of the Compose
# mapping, "${WEB_HTTP_BIND:-127.0.0.1:80}", so a Compose project's `.env` setting keeps working (#2947). It is written
# into the file as it is, so only digits, ".", ":", ${NAME:-default}, ${NAME-default} and ${NAME} (value from the .env) are accepted. Keep in step with extraPortsErrors in
# cli/src/utils/service-manifest.ts and extraPortsOf in cli/src/utils/status-ports.ts. This file has no load() on purpose.
# =============================================================================

_PROTOCOLS = ["tcp", "udp"]
# Loopback by default; every interface only when service.json asks (#2935).
_BINDS = ["127.0.0.1", "0.0.0.0"]


def _port_number(value, field):
    if type(value) != "int" or value < 1 or value > 65535:
        fail("MANIFEST ERROR: '{}' must be a port number from 1 to 65535".format(field))
    return value


_DIGITS = "0123456789"
_LITERAL = _DIGITS + ".:"
_NAME_START = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_"
_NAME_CHARS = _NAME_START + _DIGITS


def _only(text, allowed):
    for c in text.elems():
        if c not in allowed:
            return False
    return True


_MASK = "\x00"


def _publish_default(value, field):
    """Check a `publish` template and return (host port, text to write), after refusing anything unsafe or malformed.

    The host port is what the template gives with every variable at its default. When a bare ${NAME} (no default) leaves part of
    the mapping to the environment it is the literal host port if the part after the last ':' is plain digits (`${HOST}:80`),
    otherwise None: the port is not known before Compose runs. A literal run of digits that can never be a port (65536) is refused
    either way. A bare ${NAME} is written as ${NAME:?NAME is not set, add it to .env}, so Compose stops when it is unset or empty
    instead of publishing a different mapping (`${PORT}80` would otherwise become host port 80 on every interface).
    """
    if type(value) != "string" or not value:
        fail("MANIFEST ERROR: '{}.publish' must be a string such as \"${{WEB_HTTP_BIND:-127.0.0.1:80}}\"".format(field))
    parts = value.split("${")
    resolved = parts[0]
    masked = parts[0]
    written = parts[0]
    unknown = False
    if not _only(parts[0], _LITERAL):
        fail("MANIFEST ERROR: '{}.publish' accepts digits, '.', ':' and ${{NAME:-default}} only".format(field))
    for part in parts[1:]:
        body, closed, tail = part.partition("}")
        name, has_default, default = body.partition(":-")
        if not has_default:
            # ${NAME-default}: Compose uses the default only when NAME is unset. A name has no '-', so the first one splits it.
            name, has_default, default = body.partition("-")
        if not closed:
            fail("MANIFEST ERROR: '{}.publish' has a ${{ without a closing }}".format(field))
        if not name or name[0] not in _NAME_START or not _only(name, _NAME_CHARS):
            fail("MANIFEST ERROR: '{}.publish' variable names must be letters, digits or _".format(field))
        masked += _MASK + tail
        if not has_default:
            # A bare ${NAME} (any-sync: "127.0.0.1:${REDIS_PORT}"): the value comes from the environment (shell or .env).
            if not _only(tail, _LITERAL):
                fail("MANIFEST ERROR: '{}.publish' accepts digits, '.', ':' and ${{NAME:-default}} only".format(field))
            unknown = True
            written += "${" + name + ":?" + name + " is not set, add it to .env}" + tail
            continue
        if not default or not _only(default, _LITERAL) or not _only(tail, _LITERAL):
            fail("MANIFEST ERROR: '{}.publish' defaults must be a port or address:port".format(field))
        resolved += default + tail
        written += "${" + body + "}" + tail
    if unknown:
        # Template-aware: only literal digits can be checked. Mirrors unresolvedHostPort in cli/src/utils/service-manifest.ts.
        last = masked.split(":")[-1]
        pieces = last.split(_MASK)
        for piece in pieces:
            if piece.isdigit() and (len(piece) > 5 or int(piece) > 65535):
                fail("MANIFEST ERROR: '{}.publish' has a host port above 65535".format(field))
        if len(pieces) == 1:
            if not (last.isdigit() and int(last) >= 1):
                fail("MANIFEST ERROR: '{}.publish' must give a port or address:port such as 127.0.0.1:8080 (IPv4 only)".format(field))
            return int(last), written
        return None, written
    pieces = resolved.split(":")
    port_text = pieces[-1]
    ok = len(pieces) <= 2 and port_text and port_text.isdigit() and len(port_text) <= 5 and int(port_text) >= 1 and int(port_text) <= 65535
    if ok and len(pieces) == 2:
        octets = pieces[0].split(".")
        ok = len(octets) == 4
        for octet in octets:
            ok = ok and octet != "" and octet.isdigit() and len(octet) <= 3 and int(octet) <= 255
    if not ok:
        fail("MANIFEST ERROR: '{}.publish' must give a port or address:port such as 127.0.0.1:8080 (IPv4 only)".format(field))
    return int(port_text), written


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
        protocol = entry.get('protocol', 'tcp')
        if protocol not in _PROTOCOLS:
            fail("MANIFEST ERROR: '{}.protocol' must be tcp or udp".format(field))
        if entry.get('publish') != None:
            if entry.get('hostPort') != None or entry.get('bind') != None:
                fail("MANIFEST ERROR: '{}.publish' replaces hostPort and bind; remove them".format(field))
            host_port, host_side = _publish_default(entry.get('publish'), field)
        else:
            host_port = _port_number(entry.get('hostPort', port), field + ".hostPort")
            bind = entry.get('bind', '127.0.0.1')
            if bind not in _BINDS:
                fail("MANIFEST ERROR: '{}.bind' must be 127.0.0.1 or 0.0.0.0".format(field))
            host_side = "{}:{}".format(bind, host_port)
        key = "{}/{}".format(host_port, protocol)
        if host_port != None and key in seen:
            fail("MANIFEST ERROR: '{}.hostPort' {} is published twice".format(field, key))
        if host_port != None:
            seen.append(key)
        lines.append('      - "{}:{}/{}"'.format(host_side, port, protocol))

    if not lines:
        return ""
    return "    ports:\n" + "\n".join(lines) + "\n"
