// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { createServer } from "node:net";
import { FliskError } from "./errors.js";
import { hasLocalListener } from "./port-listener-probe.js";
/** The `reason` a plan gives for the HTTP and HTTPS ports when the gateway capability is off. */
export const GATEWAY_DISABLED_REASON = "gateway capability disabled";
export const DEFAULT_HOST_PORT_RANGES = {
    ingressHttp: { start: 8080, end: 8180 },
    ingressHttps: { start: 8443, end: 8543 },
    postgres: { start: 15432, end: 15532 },
};
const ENV_KEYS = {
    ingressHttp: "FLISK_HTTP_PORT",
    ingressHttps: "FLISK_HTTPS_PORT",
    postgres: "FLISK_POSTGRES_PORT",
};
const REQUESTED_PORTS = { ingressHttp: 80, ingressHttps: 443, postgres: 5432 };
// Tried before the fallback range so routed URLs need no port. Postgres keeps
// its range: a local Postgres on 5432 is common, and no URL carries that port.
export const PREFERRED_HOST_PORTS = {
    ingressHttp: REQUESTED_PORTS.ingressHttp,
    ingressHttps: REQUESTED_PORTS.ingressHttps,
};
/**
 * Whether a failed bind on 127.0.0.1 means the port is still free for Docker. Only macOS
 * refuses a non-root bind below 1024 while Docker Desktop publishes it through a privileged
 * helper. Callers check for a listener first, so a bind error here is never another process.
 */
export function isPrivilegedBindFree(errorCode, platform) {
    return errorCode === "EACCES" && platform === "darwin";
}
export async function isHostPortAvailable(port) {
    if (await hasLocalListener(port))
        return false;
    return new Promise((resolve) => {
        const server = createServer();
        server.once("error", (error) => {
            resolve(isPrivilegedBindFree(error.code, process.platform));
        });
        // Docker Desktop and Windows publish these host ports through IPv4 loopback.
        // Match that target instead of probing wildcard binds that may differ by OS.
        server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
}
function parsePort(name, value) {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new FliskError(`${name} must be an integer between 1 and 65535 (received ${JSON.stringify(value)})`, ["Provide a valid port number between 1 and 65535"], 1);
    }
    return port;
}
export async function createHostPortPlan(options = {}) {
    const env = options.env ?? process.env;
    const isAvailable = options.isAvailable ?? isHostPortAvailable;
    const explicitFlags = { ingressHttp: false, ingressHttps: false, postgres: false };
    const reasons = { ingressHttp: "", ingressHttps: "", postgres: "" };
    const selected = { explicit: explicitFlags };
    const reserved = new Set();
    const dbEnabled = options.database !== false && options.capabilities?.database !== false;
    const gatewayEnabled = options.gateway !== false && options.capabilities?.gateway !== false;
    const keys = [
        ...(gatewayEnabled ? ["ingressHttp", "ingressHttps"] : []),
        ...(dbEnabled ? ["postgres"] : []),
    ];
    if (!dbEnabled) {
        selected.postgres = 5432;
        explicitFlags.postgres = false;
        reasons.postgres = "database capability disabled";
    }
    if (!gatewayEnabled) {
        selected.ingressHttp = REQUESTED_PORTS.ingressHttp;
        selected.ingressHttps = REQUESTED_PORTS.ingressHttps;
        reasons.ingressHttp = GATEWAY_DISABLED_REASON;
        reasons.ingressHttps = GATEWAY_DISABLED_REASON;
    }
    for (const key of keys) {
        const envValue = env[ENV_KEYS[key]];
        const explicit = envValue !== undefined && envValue.trim() !== "";
        const range = options.ranges?.[key] ?? DEFAULT_HOST_PORT_RANGES[key];
        const preferred = PREFERRED_HOST_PORTS[key];
        const candidates = explicit
            ? [parsePort(ENV_KEYS[key], envValue)]
            : [
                ...(preferred === undefined ? [] : [preferred]),
                ...Array.from({ length: range.end - range.start + 1 }, (_, index) => range.start + index),
            ];
        let chosen;
        for (const port of candidates) {
            if (reserved.has(port))
                continue;
            if (await isAvailable(port)) {
                chosen = port;
                break;
            }
            if (explicit) {
                throw new FliskError(`${ENV_KEYS[key]}=${port} is already in use. Choose a free host port and retry.`, [
                    "Choose a different free host port or unset the environment variable to use fallback ranges",
                ], 1);
            }
        }
        if (chosen === undefined) {
            throw new FliskError(`No available host port in ${range.start}-${range.end} for ${key}. Set ${ENV_KEYS[key]} to a free port and retry.`, [
                `Free up port range ${range.start}-${range.end} or set ${ENV_KEYS[key]} to an available port`,
            ], 1);
        }
        reserved.add(chosen);
        selected[key] = chosen;
        explicitFlags[key] = explicit;
        reasons[key] = explicit
            ? "explicit override"
            : chosen === preferred
                ? "requested port is free"
                : `selected from fallback range ${range.start}-${range.end}`;
    }
    return {
        ...selected,
        requested: { ...REQUESTED_PORTS },
        reason: reasons,
    };
}
export function formatHostPortPlan(plan) {
    const parts = [
        ...(plan.reason?.ingressHttp === GATEWAY_DISABLED_REASON
            ? []
            : [`HTTP ${plan.ingressHttp}`, `HTTPS ${plan.ingressHttps}`]),
        ...(plan.reason?.postgres === "database capability disabled"
            ? []
            : [`Postgres ${plan.postgres}`]),
    ];
    return parts.length > 0 ? `Host ports: ${parts.join(", ")}` : "Host ports: none needed";
}
/** The plan with HTTP and HTTPS marked as not needed, for a project whose gateway capability is off. */
export function withoutGatewayPorts(plan) {
    return {
        ...plan,
        ingressHttp: REQUESTED_PORTS.ingressHttp,
        ingressHttps: REQUESTED_PORTS.ingressHttps,
        explicit: { ...plan.explicit, ingressHttp: false, ingressHttps: false },
        reason: {
            ...plan.reason,
            ingressHttp: GATEWAY_DISABLED_REASON,
            ingressHttps: GATEWAY_DISABLED_REASON,
        },
    };
}
