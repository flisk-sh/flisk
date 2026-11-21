// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { isRoutedBringYourOwn } from "../service-urls.js";
import { URL_PROBE_TIMEOUT_MS } from "./probe.js";
/** Traefik's own body when no router matches (Go's http.NotFound). A service's own 404 is an answer: the route reached it. */
const TRAEFIK_NOT_FOUND = "404 page not found";
/**
 * The bodies Traefik writes for its own gateway errors: the status text from its proxy error handler (502, 504), the same for a
 * 503, and "no available server" when the load balancer has no healthy server. A 502/503/504 with any other body came from the
 * service (a maintenance page, an upstream of its own), which answered.
 */
const TRAEFIK_GATEWAY_BODIES = {
    502: ["Bad Gateway"],
    503: ["Service Unavailable", "no available server"],
    504: ["Gateway Timeout"],
};
/** `<path>/health` for a URL, without doubling a trailing slash and leaving any query or fragment where it is. */
export function healthUrlOf(url) {
    try {
        const parsed = new URL(url);
        const path = parsed.pathname.replace(/\/+$/, "");
        if (!path.endsWith("/health"))
            parsed.pathname = `${path}/health`;
        return parsed.toString();
    }
    catch {
        return url.endsWith("/health") ? url : `${url.replace(/\/+$/, "")}/health`;
    }
}
/**
 * The health URL `flisk up` prints for a service, or null when it has none to print. Flisk's own service types answer
 * `/health`. A routed bring-your-own service's health path is its own (often `/`), so it gets one only when service.json
 * declares a `healthCheckPath` other than `/`, resolved against its URL.
 */
export function printedHealthUrl(resource, url) {
    if (!isRoutedBringYourOwn(resource))
        return healthUrlOf(url);
    const path = resource.config?.healthCheckPath;
    if (!path || path === "/")
        return null;
    try {
        const parsed = new URL(url);
        parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
        return parsed.toString();
    }
    catch {
        return null;
    }
}
/** True for a URL whose host is this machine: the local ingress gateway that `flisk up` started. */
export function isLocalGatewayUrl(url) {
    try {
        const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
        return (host === "localhost" ||
            host.endsWith(".localhost") ||
            host === "::1" ||
            /^127\.\d+\.\d+\.\d+$/.test(host));
    }
    catch {
        return false;
    }
}
/**
 * Whether a probe counts as an answer, and the cause when it does not. Any HTTP response from the service counts, a 404, 500
 * or its own 503 included: this checks that each printed URL is reachable, not that the app is healthy. Only Traefik's own
 * errors do not count, recognised by their body. A refused connection blames the gateway only when `url` is local; with a
 * `FLISK_SERVICE_BASE_URL` pointing elsewhere it is a plain request failure.
 */
export function classifyProbe(probe, url) {
    const { status } = probe;
    if (status === undefined) {
        if (probe.error === "timeout")
            return { didAnswer: false, cause: "timeout" };
        if (probe.error === "ECONNREFUSED" && (url === undefined || isLocalGatewayUrl(url))) {
            return { didAnswer: false, cause: "gateway-not-listening" };
        }
        return { didAnswer: false, cause: "no-response" };
    }
    const body = (probe.body ?? "").trim();
    if (status === 404 && body === TRAEFIK_NOT_FOUND) {
        return { didAnswer: false, cause: "route-not-found" };
    }
    if (TRAEFIK_GATEWAY_BODIES[status]?.includes(body)) {
        return { didAnswer: false, cause: "port-not-listening" };
    }
    return { didAnswer: true };
}
const LOG_LEVEL_WORDS = new Set([
    "ERROR",
    "WARN",
    "WARNING",
    "INFO",
    "DEBUG",
    "FATAL",
    "HTTP",
    "GET",
    "POST",
]);
/** How many trailing log lines the missing-variable diagnosis reads: the latest crash, not an earlier run's. */
const MISSING_ENV_LOG_LINES = 40;
/**
 * The environment variable a service's latest log lines say is not set, or null. Only the last lines are read, so an old
 * message from a run that has since been fixed is not blamed for a new failure. A Python `KeyError` counts only when the
 * traceback reads `environ`, since a KeyError on its own is any missing dictionary key.
 */
export function findMissingEnvName(logs) {
    const lines = logs.split(/\r?\n/).slice(-MISSING_ENV_LOG_LINES);
    const tail = lines.join("\n");
    const patterns = [
        // "Missing required environment variable: DATABASE_URL", "missing env var API_KEY"
        /\b(?:missing|undefined|unset)\s+(?:required\s+)?(?:environment|env)\s+(?:variable|var)s?\s*:?\s*['"`]?([A-Za-z_][A-Za-z0-9_]*)/i,
        // "environment variable API_KEY is not set", "env var X must be set"
        /\b(?:environment|env)\s+(?:variable|var)\s+['"`]?([A-Za-z_][A-Za-z0-9_]*)['"`]?\s+(?:is\s+)?(?:missing|not set|required|undefined|unset|must be set)/i,
        // "API_KEY is not set", "DATABASE_URL is required", "SECRET must be set"
        /\b([A-Z][A-Z0-9_]{2,})['"`]?\s+(?:is\s+)?(?:not set|required|missing|undefined|must be set)\b/,
    ];
    for (const pattern of patterns) {
        const lines = tail.split("\n").reverse();
        for (const line of lines) {
            const name = pattern.exec(line)?.[1];
            if (name && !LOG_LEVEL_WORDS.has(name.toUpperCase()))
                return name;
        }
    }
    // Python: os.environ["API_KEY"] raises KeyError: 'API_KEY'.
    if (/\benviron\b/.test(tail)) {
        for (const line of [...lines].reverse()) {
            const name = /KeyError:\s*['"]([A-Z][A-Z0-9_]+)['"]/.exec(line)?.[1];
            if (name)
                return name;
        }
    }
    return null;
}
/** The message and next command for a URL that did not answer. */
export function describeUrlFailure(target, failure) {
    const { service } = target;
    const logs = `flisk logs -s ${service}`;
    switch (failure.cause) {
        case "missing-env":
            return {
                message: `the latest logs of ${service} say the environment variable ${failure.envName ?? "(unnamed)"} is not set`,
                nextCommand: `add ${failure.envName ?? "it"}=<value> to .env, then run: flisk restart ${service} --rebuild`,
            };
        case "container-exited":
            return {
                message: `${service} exited after it started, so nothing answers this URL`,
                nextCommand: logs,
            };
        case "port-not-listening":
            return {
                message: `Traefik has the route but got no answer from ${service} (Traefik's own HTTP ${failure.status ?? 502}): likely nothing listens on ${target.port ? `port ${target.port}` : "the declared port"}, or the app listens only on 127.0.0.1`,
                nextCommand: logs,
            };
        case "route-not-found":
            return {
                message: `Traefik has no route for this URL (its own 404), so the request never reaches ${service}`,
                nextCommand: "flisk networks",
            };
        case "gateway-not-listening":
            return {
                message: "Nothing listens on the gateway port: Traefik is not running or is bound to another port (on Colima, the VM may have stopped forwarding ports: colima restart)",
                nextCommand: "flisk doctor",
            };
        case "timeout":
            return {
                message: `No response from ${service} within ${URL_PROBE_TIMEOUT_MS / 1000}s`,
                nextCommand: logs,
            };
        case "no-response":
            return {
                message: failure.error === "incomplete response"
                    ? `The connection closed before the whole response from ${service} arrived`
                    : `The request failed${failure.error ? ` (${failure.error})` : ""}; check the host and port of this URL`,
                nextCommand: "flisk doctor",
            };
    }
}
