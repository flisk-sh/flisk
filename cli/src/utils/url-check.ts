// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { DiscoveredResource } from "../types/index.js";
import { resolveServiceUrl } from "./service-urls.js";

/**
 * Why a URL `flisk up` printed does not answer (#3211). `flisk up` says "ready" only when every printed URL answers, and names
 * one of these causes for each one that does not.
 */
export type UrlFailureCause =
  /** Nothing listens on the ingress port, so Traefik itself is down or bound elsewhere. */
  | "gateway-not-listening"
  /** Traefik answered with its own 404: it has no router for this host and path. */
  | "route-not-found"
  /** Traefik has the route but nothing answers behind it (502/503/504): the process does not listen on its declared port. */
  | "port-not-listening"
  /** The service's container or process stopped. */
  | "container-exited"
  /** The service's logs name an environment variable it needs and does not have. */
  | "missing-env"
  /** No response within the probe timeout. */
  | "timeout"
  /** The request failed some other way (DNS, reset, TLS). */
  | "no-response";

/** One URL `flisk up` prints, and the service it belongs to. */
export interface UrlTarget {
  service: string;
  url: string;
  /** The service's declared port, named in the port-not-listening message. */
  port?: number;
}

/** The result of one probe, before any diagnosis from the service's state or logs. */
export interface UrlProbe {
  /** HTTP status, or undefined when no response came back. */
  status?: number;
  /** The first bytes of the body, to tell Traefik's own 404 from the service's. */
  body?: string;
  /** Why the request failed when no response came back (an error code such as ECONNREFUSED, or "timeout"). */
  error?: string;
}

/** The per-URL result `flisk up` prints and carries in `flisk up --json` (`data.urls`). */
export interface UrlCheck {
  service: string;
  url: string;
  didAnswer: boolean;
  status?: number;
  cause?: UrlFailureCause;
  /** What is wrong, in a user's words. */
  message?: string;
  /** The one command to run next. */
  nextCommand?: string;
  /** For `missing-env`: the variable the service asked for. */
  envName?: string;
}

/** What the diagnosis may learn about a service after its URL failed. Each lookup is optional and may return null. */
export interface UrlDiagnosisDeps {
  /** True when the service's container or process has exited. */
  hasExited?: (service: string) => Promise<boolean | null>;
  /** The service's recent log text. */
  logs?: (service: string) => Promise<string | null>;
}

export type UrlProber = (url: string, timeoutMs: number) => Promise<UrlProbe>;

/** Per-request timeout: short, because the stack already reported ready and a live route answers in milliseconds. */
export const URL_PROBE_TIMEOUT_MS = 3_000;
/** How long a failing URL is retried: Traefik can take a moment to pick up a route after the container turns healthy. */
export const URL_CHECK_DEADLINE_MS = 15_000;
const URL_CHECK_INTERVAL_MS = 500;
const BODY_SAMPLE_BYTES = 512;

/** Traefik's own body when no router matches (Go's http.NotFound). A service's own 404 is an answer: the route reached it. */
const TRAEFIK_NOT_FOUND = "404 page not found";

/**
 * The URLs `flisk up` prints for the services it started: each routed service's URL and its health URL. Deferred services
 * (Sablier `deferStart`) are left out: a request would start them, and they are printed as starting on first request.
 */
export function buildPrintedUrlTargets(
  resources: readonly DiscoveredResource[],
  ingressPort: number | undefined,
  deferred: ReadonlySet<string> = new Set(),
): UrlTarget[] {
  const targets: UrlTarget[] = [];
  for (const resource of resources) {
    if (deferred.has(resource.name)) continue;
    const url = resolveServiceUrl(resource, ingressPort);
    if (!url) continue;
    const port = resource.config?.port;
    targets.push({ service: resource.name, url, ...(port ? { port } : {}) });
    targets.push({ service: resource.name, url: healthUrlOf(url), ...(port ? { port } : {}) });
  }
  return targets;
}

/** The health URL `flisk up` prints for a service URL: `<url>/health`, without doubling a trailing slash. */
export function healthUrlOf(url: string): string {
  return url.endsWith("/health") ? url : `${url.replace(/\/+$/, "")}/health`;
}

/** Whether a probe counts as an answer, and the cause when it does not. Any HTTP response counts, except Traefik's own errors. */
export function classifyProbe(probe: UrlProbe): { didAnswer: boolean; cause?: UrlFailureCause } {
  const { status } = probe;
  if (status === undefined) {
    if (probe.error === "timeout") return { didAnswer: false, cause: "timeout" };
    if (probe.error === "ECONNREFUSED") return { didAnswer: false, cause: "gateway-not-listening" };
    return { didAnswer: false, cause: "no-response" };
  }
  if (status === 404 && (probe.body ?? "").trim() === TRAEFIK_NOT_FOUND) {
    return { didAnswer: false, cause: "route-not-found" };
  }
  if (status === 502 || status === 503 || status === 504) {
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

/**
 * The environment variable a service's logs say it is missing, or null. Reads the last lines only, so an old message from a
 * run that has since been fixed does not count.
 */
export function findMissingEnvName(logs: string): string | null {
  const tail = logs.split(/\r?\n/).slice(-200).join("\n");
  const patterns: RegExp[] = [
    // "Missing required environment variable: DATABASE_URL", "missing env var API_KEY"
    /\b(?:missing|undefined|unset)\s+(?:required\s+)?(?:environment|env)\s+(?:variable|var)s?\s*:?\s*['"`]?([A-Za-z_][A-Za-z0-9_]*)/i,
    // "environment variable API_KEY is not set", "env var X must be set"
    /\b(?:environment|env)\s+(?:variable|var)\s+['"`]?([A-Za-z_][A-Za-z0-9_]*)['"`]?\s+(?:is\s+)?(?:missing|not set|required|undefined|unset|must be set)/i,
    // Python: KeyError: 'API_KEY' (os.environ["API_KEY"])
    /KeyError:\s*['"]([A-Z][A-Z0-9_]+)['"]/,
    // "API_KEY is not set", "DATABASE_URL is required", "SECRET must be set"
    /\b([A-Z][A-Z0-9_]{2,})['"`]?\s+(?:is\s+)?(?:not set|required|missing|undefined|must be set)\b/,
  ];
  for (const pattern of patterns) {
    const lines = tail.split("\n").reverse();
    for (const line of lines) {
      const name = pattern.exec(line)?.[1];
      if (name && !LOG_LEVEL_WORDS.has(name.toUpperCase())) return name;
    }
  }
  return null;
}

/** The message and next command for a URL that did not answer. */
export function describeUrlFailure(
  target: UrlTarget,
  failure: { cause: UrlFailureCause; status?: number; envName?: string; error?: string },
): { message: string; nextCommand: string } {
  const { service } = target;
  const logs = `flisk logs -s ${service}`;
  switch (failure.cause) {
    case "missing-env":
      return {
        message: `${service} needs the environment variable ${failure.envName ?? "(unnamed)"}, which is not set`,
        nextCommand: `add ${failure.envName ?? "it"}=<value> to .env, then run: flisk restart ${service}`,
      };
    case "container-exited":
      return {
        message: `${service} exited after it started, so nothing answers this URL`,
        nextCommand: logs,
      };
    case "port-not-listening":
      return {
        message: `Traefik has the route, but nothing answers on ${target.port ? `port ${target.port}` : "the declared port"} of ${service} (HTTP ${failure.status ?? 502}); the app may listen on another port or only on 127.0.0.1`,
        nextCommand: logs,
      };
    case "route-not-found":
      return {
        message: `Traefik has no route for this URL (its own 404), so the request never reaches ${service}`,
        nextCommand: "flisk networks",
      };
    case "gateway-not-listening":
      return {
        message:
          "Nothing listens on the gateway port: Traefik is not running or is bound to another port",
        nextCommand: "flisk doctor",
      };
    case "timeout":
      return {
        message: `No response from ${service} within ${URL_PROBE_TIMEOUT_MS / 1000}s`,
        nextCommand: logs,
      };
    case "no-response":
      return {
        message: `The request failed${failure.error ? ` (${failure.error})` : ""}`,
        nextCommand: "flisk doctor",
      };
  }
}

/**
 * Probes every target until it answers or the deadline passes, then diagnoses each one that still does not: a missing
 * environment variable named in the service's logs, or an exited container, take precedence over what the probe alone says.
 */
export async function checkPrintedUrls(
  targets: readonly UrlTarget[],
  options: {
    probe?: UrlProber;
    diagnosis?: UrlDiagnosisDeps;
    timeoutMs?: number;
    deadlineMs?: number;
    intervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {},
): Promise<UrlCheck[]> {
  const probe = options.probe ?? probeUrl;
  const timeoutMs = options.timeoutMs ?? URL_PROBE_TIMEOUT_MS;
  const deadlineMs = options.deadlineMs ?? URL_CHECK_DEADLINE_MS;
  const intervalMs = options.intervalMs ?? URL_CHECK_INTERVAL_MS;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + deadlineMs;

  const results = new Map<number, UrlProbe>();
  let pending = targets.map((target, index) => ({ target, index }));
  while (pending.length > 0) {
    const probed = await Promise.all(
      pending.map(async (entry) => ({
        ...entry,
        result: await probe(entry.target.url, timeoutMs),
      })),
    );
    for (const { index, result } of probed) results.set(index, result);
    pending = probed
      .filter(({ result }) => !classifyProbe(result).didAnswer)
      .map(({ target, index }) => ({ target, index }));
    if (pending.length === 0 || now() >= deadline) break;
    await sleep(intervalMs);
  }

  // One diagnosis per service, shared by its URLs.
  const diagnosed = new Map<string, Promise<{ cause: UrlFailureCause; envName?: string } | null>>();
  const diagnose = (service: string) => {
    let found = diagnosed.get(service);
    if (!found) {
      found = diagnoseService(service, options.diagnosis ?? {});
      diagnosed.set(service, found);
    }
    return found;
  };

  return Promise.all(
    targets.map(async (target, index): Promise<UrlCheck> => {
      const result = results.get(index) ?? { error: "not probed" };
      const classified = classifyProbe(result);
      const base: UrlCheck = {
        service: target.service,
        url: target.url,
        didAnswer: classified.didAnswer,
        ...(result.status !== undefined ? { status: result.status } : {}),
      };
      if (classified.didAnswer || !classified.cause) return base;
      // A gateway that is down says nothing about the service, so its logs are not consulted.
      const fromService =
        classified.cause === "gateway-not-listening" ? null : await diagnose(target.service);
      const cause = fromService?.cause ?? classified.cause;
      const envName = fromService?.envName;
      const { message, nextCommand } = describeUrlFailure(target, {
        cause,
        status: result.status,
        envName,
        error: result.error,
      });
      return { ...base, cause, message, nextCommand, ...(envName ? { envName } : {}) };
    }),
  );
}

async function diagnoseService(
  service: string,
  deps: UrlDiagnosisDeps,
): Promise<{ cause: UrlFailureCause; envName?: string } | null> {
  const logs = deps.logs ? await deps.logs(service).catch(() => null) : null;
  const envName = logs ? findMissingEnvName(logs) : null;
  if (envName) return { cause: "missing-env", envName };
  const hasExited = deps.hasExited ? await deps.hasExited(service).catch(() => null) : null;
  if (hasExited) return { cause: "container-exited" };
  return null;
}

/** The lines `flisk up` prints for the URLs that do not answer. */
export function formatUrlFailures(checks: readonly UrlCheck[]): string[] {
  const failed = checks.filter((check) => !check.didAnswer);
  if (failed.length === 0) return [];
  const lines = [
    `Not ready: ${failed.length} of ${checks.length} printed URL${checks.length === 1 ? "" : "s"} ${failed.length === 1 ? "does" : "do"} not answer.`,
  ];
  for (const check of failed) {
    lines.push(`  ✗ ${check.service}: ${check.url}`);
    if (check.message) lines.push(`      cause: ${check.message}`);
    if (check.nextCommand) lines.push(`      next:  ${check.nextCommand}`);
  }
  return lines;
}

/** The distinct next commands of the failed checks, in order, for the error's suggestions. */
export function urlFailureSuggestions(checks: readonly UrlCheck[]): string[] {
  const next = checks
    .filter((check) => !check.didAnswer && check.nextCommand)
    .map((check) => `${check.service}: ${check.nextCommand}`);
  return [...new Set(next), "Tilt is still running; stop it with: flisk down"];
}

/** True when the Tilt resource of a service has exited (`runtimeStatus: error`), read from `tilt get uiresources -o json`. */
export function tiltResourceHasExited(uiResourcesJson: string, service: string): boolean | null {
  try {
    const parsed = JSON.parse(uiResourcesJson) as {
      items?: Array<{ metadata?: { name?: string }; status?: { runtimeStatus?: string } }>;
    };
    const item = parsed.items?.find((entry) => entry.metadata?.name === service);
    if (!item) return null;
    return item.status?.runtimeStatus === "error";
  } catch {
    return null;
  }
}

/**
 * GET one URL and keep its status and the start of its body. A `*.localhost` host is sent to 127.0.0.1 with its Host header:
 * not every resolver maps subdomains of localhost (glibc does not), and fetch drops a Host header that is set by hand.
 */
export function probeUrl(url: string, timeoutMs: number): Promise<UrlProbe> {
  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      resolve({ error: "invalid URL" });
      return;
    }
    const isHttps = parsed.protocol === "https:";
    const hostname = parsed.hostname;
    const isLoopbackName = hostname === "localhost" || hostname.endsWith(".localhost");
    const request = isHttps ? httpsRequest : httpRequest;
    let settled = false;
    const finish = (probe: UrlProbe) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(probe);
    };
    const req = request(
      {
        protocol: parsed.protocol,
        hostname: isLoopbackName ? "127.0.0.1" : hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers: { Host: parsed.host, "User-Agent": "flisk-up-url-check" },
        ...(isHttps && isLoopbackName ? { servername: hostname, rejectUnauthorized: false } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          if (size < BODY_SAMPLE_BYTES) {
            chunks.push(chunk);
            size += chunk.length;
          }
          if (size >= BODY_SAMPLE_BYTES) res.destroy();
        });
        const done = () =>
          finish({
            status: res.statusCode,
            body: Buffer.concat(chunks).subarray(0, BODY_SAMPLE_BYTES).toString("utf-8"),
          });
        res.on("end", done);
        res.on("close", done);
        res.on("error", done);
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      finish({ error: "timeout" });
    }, timeoutMs);
    req.on("error", (err: NodeJS.ErrnoException) => finish({ error: err.code ?? err.message }));
    req.end();
  });
}
