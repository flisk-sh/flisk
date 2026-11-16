// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { parseHostMapping, publishVariables, substitutePublish } from "./extra-port-publish.js";
import { isPlainObject } from "./is-plain-object.js";
const isPortNumber = (value) => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535;
/**
 * The host port a `publish` template gives when no variable is set, or why the template is refused (see extra-port-publish.ts).
 * null when a bare `${NAME}` leaves the host port to the environment, so it is not known before Compose runs.
 */
/**
 * The host port of a template with a bare `${NAME}` (no default), read template-aware: the part after the last literal ":" is the
 * port, and it is known only when it is plain digits (`${HOST}:80`). A literal run of digits that can never be a port (65536,
 * `127.0.0.1:65536${A}`) is refused whatever the variable holds. null when the port comes from a variable. Mirrors
 * _publish_default in engine/.../compose/byo_ports.star.
 */
function unresolvedHostPort(publish) {
    const last = publish
        .replace(/\$\{[^}]*\}/g, "\u0000")
        .split(":")
        .pop() ?? "";
    const pieces = last.split("\u0000");
    if (pieces.some((piece) => /^[0-9]+$/.test(piece) && (piece.length > 5 || Number(piece) > 65535))) {
        return "has a host port above 65535";
    }
    if (pieces.length > 1)
        return null;
    if (!/^[0-9]+$/.test(last) || Number(last) < 1) {
        return "must give a port or address:port such as 127.0.0.1:8080 (IPv4 only)";
    }
    return Number(last);
}
function publishError(publish) {
    if (typeof publish !== "string" || publish === "") {
        return 'expected a string such as "${WEB_HTTP_BIND:-127.0.0.1:80}"';
    }
    const variables = publishVariables(publish);
    if (typeof variables === "string")
        return variables;
    if (variables.some((variable) => !variable.hasDefault))
        return unresolvedHostPort(publish);
    const mapping = parseHostMapping(substitutePublish(publish));
    if (!mapping)
        return "must give a port or address:port such as 127.0.0.1:8080 (IPv4 only)";
    return mapping.port;
}
/**
 * `extraPorts` (#2909): plain host ports on 127.0.0.1 for a bring-your-own resource, next to the routed `port`. Mirrors
 * engine/.../compose/byo_ports.star, which refuses the same values.
 */
export function extraPortsErrors(manifest, displayPath) {
    const extra = manifest.extraPorts;
    if (extra === undefined || extra === null)
        return [];
    const field = `${displayPath}.extraPorts`;
    if (!Array.isArray(extra))
        return [`${field}: expected a list such as [{ "port": 443 }]`];
    if (manifest.appType !== "bring-your-own") {
        return [`${field}: only applies to bring-your-own resources (appType "bring-your-own")`];
    }
    const errors = [];
    if (extra.length > 0 && manifest.replicas !== undefined && manifest.replicas !== 1) {
        errors.push(`${field}: needs a single container; remove replicas`);
    }
    const seen = new Set();
    extra.forEach((entry, i) => {
        const at = `${field}[${i}]`;
        if (!isPlainObject(entry)) {
            errors.push(`${at}: expected an object such as { "port": 443 }`);
            return;
        }
        for (const key of Object.keys(entry)) {
            if (!["port", "hostPort", "protocol", "bind", "publish"].includes(key)) {
                errors.push(`${at}.${key}: unknown option (use port, hostPort, protocol, bind, publish)`);
            }
        }
        if (!isPortNumber(entry.port))
            errors.push(`${at}.port: expected a port number from 1 to 65535`);
        let hostPort = entry.hostPort ?? entry.port;
        if (entry.publish !== undefined) {
            if (entry.hostPort !== undefined || entry.bind !== undefined) {
                errors.push(`${at}.publish: replaces hostPort and bind; remove them`);
            }
            const mapping = publishError(entry.publish);
            if (typeof mapping === "string")
                errors.push(`${at}.publish: ${mapping}`);
            else
                hostPort = mapping; // null: the host port comes from a variable, nothing to compare
        }
        else {
            if (entry.hostPort !== undefined && !isPortNumber(entry.hostPort)) {
                errors.push(`${at}.hostPort: expected a port number from 1 to 65535`);
            }
            if (entry.bind !== undefined && entry.bind !== "127.0.0.1" && entry.bind !== "0.0.0.0") {
                errors.push(`${at}.bind: expected 127.0.0.1 or 0.0.0.0`);
            }
        }
        const protocol = entry.protocol ?? "tcp";
        if (protocol !== "tcp" && protocol !== "udp")
            errors.push(`${at}.protocol: expected tcp or udp`);
        if (hostPort === null)
            return; // only the published-twice check needs the host port
        const key = `${String(hostPort)}/${String(protocol)}`;
        if (seen.has(key))
            errors.push(`${at}.hostPort: ${key} is published twice`);
        seen.add(key);
    });
    return errors;
}
