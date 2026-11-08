// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isRoutedBringYourOwn, resolveServiceUrl } from "./service-urls.js";
/** Per-request timeout: short, because the stack already reported ready and a live route answers in milliseconds. */
export const URL_PROBE_TIMEOUT_MS = 3_000;
/** How long a failing URL is retried: Traefik can take a moment to pick up a route after the container turns healthy. */
export const URL_CHECK_DEADLINE_MS = 15_000;
const URL_CHECK_INTERVAL_MS = 500;
/** At most this many requests at once, so a large stack does not hit the gateway with every URL in the same instant. */
export const URL_CHECK_CONCURRENCY = 8;
const BODY_SAMPLE_BYTES = 512;
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
/**
 * The URLs `flisk up` prints for the services it started: each routed service's URL and its health URL. Deferred services
 * (Sablier `deferStart`) are left out: a request would start them, and they are printed as starting on first request.
 */
export function buildPrintedUrlTargets(resources, ingressPort, deferred = new Set()) {
    const targets = [];
    for (const resource of resources) {
        if (deferred.has(resource.name))
            continue;
        const url = resolveServiceUrl(resource, ingressPort);
        if (!url)
            continue;
        const port = resource.config?.port;
        targets.push({ service: resource.name, url, ...(port ? { port } : {}) });
        const healthUrl = printedHealthUrl(resource, url);
        if (healthUrl)
            targets.push({ service: resource.name, url: healthUrl, ...(port ? { port } : {}) });
    }
    return targets;
}
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
                nextCommand: `add ${failure.envName ?? "it"}=<value> to .env, then run: flisk restart ${service}`,
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
/**
 * Probes every target until it answers or the deadline passes, then diagnoses each one that still does not: a missing
 * environment variable named in the service's logs, or an exited container, take precedence over what the probe alone says.
 */
export async function checkPrintedUrls(targets, options = {}) {
    const probe = options.probe ?? probeUrl;
    const timeoutMs = options.timeoutMs ?? URL_PROBE_TIMEOUT_MS;
    const deadlineMs = options.deadlineMs ?? URL_CHECK_DEADLINE_MS;
    const intervalMs = options.intervalMs ?? URL_CHECK_INTERVAL_MS;
    const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const now = options.now ?? Date.now;
    const deadline = now() + deadlineMs;
    const results = new Map();
    let pending = targets.map((target, index) => ({ target, index }));
    for (let attempt = 0; pending.length > 0; attempt++) {
        // Every URL is requested at least once. After that a retry starts only before the deadline and gets only the time left.
        const left = deadline - now();
        if (attempt > 0 && left <= 0)
            break;
        const budget = Math.max(1, Math.min(timeoutMs, left));
        const probed = await mapWithConcurrency(pending, options.concurrency ?? URL_CHECK_CONCURRENCY, async (entry) => ({ ...entry, result: await probe(entry.target.url, budget) }));
        for (const { index, result } of probed)
            results.set(index, result);
        pending = probed
            .filter(({ target, result }) => !classifyProbe(result, target.url).didAnswer)
            .map(({ target, index }) => ({ target, index }));
        const remaining = deadline - now();
        if (pending.length === 0 || remaining <= 0)
            break;
        await sleep(Math.min(intervalMs, remaining));
    }
    // One diagnosis per service, shared by its URLs.
    const diagnosed = new Map();
    const diagnose = (service) => {
        let found = diagnosed.get(service);
        if (!found) {
            found = diagnoseService(service, options.diagnosis ?? {});
            diagnosed.set(service, found);
        }
        return found;
    };
    return Promise.all(targets.map(async (target, index) => {
        const result = results.get(index) ?? { error: "not probed" };
        const classified = classifyProbe(result, target.url);
        const base = {
            service: target.service,
            url: target.url,
            didAnswer: classified.didAnswer,
            ...(result.status !== undefined ? { status: result.status } : {}),
        };
        if (classified.didAnswer || !classified.cause)
            return base;
        // A gateway that is down says nothing about the service, so its logs are not consulted.
        const fromService = classified.cause === "gateway-not-listening" ? null : await diagnose(target.service);
        const cause = fromService?.cause ?? classified.cause;
        const envName = fromService?.envName;
        const { message, nextCommand } = describeUrlFailure(target, {
            cause,
            status: result.status,
            envName,
            error: result.error,
        });
        return { ...base, cause, message, nextCommand, ...(envName ? { envName } : {}) };
    }));
}
/** `items.map(fn)` with at most `limit` calls in flight, results in input order. */
async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index]);
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
    return results;
}
async function diagnoseService(service, deps) {
    const logs = deps.logs ? await deps.logs(service).catch(() => null) : null;
    const envName = logs ? findMissingEnvName(logs) : null;
    if (envName)
        return { cause: "missing-env", envName };
    const hasExited = deps.hasExited ? await deps.hasExited(service).catch(() => null) : null;
    if (hasExited)
        return { cause: "container-exited" };
    return null;
}
/** The lines `flisk up` prints for the URLs that do not answer. */
export function formatUrlFailures(checks) {
    const failed = checks.filter((check) => !check.didAnswer);
    if (failed.length === 0)
        return [];
    const lines = [
        `Not ready: ${failed.length} of ${checks.length} printed URL${checks.length === 1 ? "" : "s"} ${failed.length === 1 ? "does" : "do"} not answer.`,
    ];
    for (const check of failed) {
        lines.push(`  ✗ ${check.service}: ${check.url}`);
        if (check.message)
            lines.push(`      likely cause: ${check.message}`);
        if (check.nextCommand)
            lines.push(`      next:  ${check.nextCommand}`);
    }
    return lines;
}
/** The distinct next commands of the failed checks, in order, for the error's suggestions. */
export function urlFailureSuggestions(checks) {
    const next = checks
        .filter((check) => !check.didAnswer && check.nextCommand)
        .map((check) => `${check.service}: ${check.nextCommand}`);
    return [...new Set(next), "Tilt is still running; stop it with: flisk down"];
}
/** True when the Tilt resource of a service has exited (`runtimeStatus: error`), read from `tilt get uiresources -o json`. */
export function tiltResourceHasExited(uiResourcesJson, service) {
    try {
        const parsed = JSON.parse(uiResourcesJson);
        const item = parsed.items?.find((entry) => entry.metadata?.name === service);
        if (!item)
            return null;
        return item.status?.runtimeStatus === "error";
    }
    catch {
        return null;
    }
}
/**
 * GET one URL and keep its status and the start of its body. A `*.localhost` host is sent to 127.0.0.1 with its Host header:
 * not every resolver maps subdomains of localhost (glibc does not), and fetch drops a Host header that is set by hand.
 */
export function probeUrl(url, timeoutMs) {
    return new Promise((resolve) => {
        let parsed;
        try {
            parsed = new URL(url);
        }
        catch {
            resolve({ error: "invalid URL" });
            return;
        }
        const isHttps = parsed.protocol === "https:";
        const hostname = parsed.hostname;
        const isLoopbackName = hostname === "localhost" || hostname.endsWith(".localhost");
        const request = isHttps ? httpsRequest : httpRequest;
        let settled = false;
        const finish = (probe) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(probe);
        };
        const req = request({
            protocol: parsed.protocol,
            hostname: isLoopbackName ? "127.0.0.1" : hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: `${parsed.pathname}${parsed.search}`,
            method: "GET",
            headers: { Host: parsed.host, "User-Agent": "flisk-up-url-check" },
            // The certificate is checked as usual; one that does not verify is a request error (no-response), not an answer.
            ...(isHttps ? { servername: hostname } : {}),
        }, (res) => {
            const chunks = [];
            let size = 0;
            // Set when this side stops reading after the sample: a body that long is not one of Traefik's short error bodies, so
            // the status alone decides. Any other early end leaves the body unknown.
            let isSampled = false;
            const answer = () => finish({
                status: res.statusCode,
                body: Buffer.concat(chunks).subarray(0, BODY_SAMPLE_BYTES).toString("utf-8"),
            });
            res.on("data", (chunk) => {
                if (size < BODY_SAMPLE_BYTES) {
                    chunks.push(chunk);
                    size += chunk.length;
                }
                if (size >= BODY_SAMPLE_BYTES && !isSampled) {
                    isSampled = true;
                    answer();
                    res.destroy();
                }
            });
            res.on("end", answer);
            // A connection that closes or fails before the whole response arrived is not an answer: a cut-off "Bad Gateway"
            // must not read as the service's own 502. The URL is retried until the deadline.
            const cutOff = () => {
                if (res.complete)
                    answer();
                else
                    finish({ error: "incomplete response" });
            };
            res.on("close", cutOff);
            res.on("error", cutOff);
        });
        const timer = setTimeout(() => {
            req.destroy();
            finish({ error: "timeout" });
        }, timeoutMs);
        req.on("error", (err) => finish({ error: err.code ?? err.message }));
        req.end();
    });
}
