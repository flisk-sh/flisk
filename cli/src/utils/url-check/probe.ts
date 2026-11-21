// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { UrlFailureCause, UrlProbe } from "./classify.js";
import { classifyProbe, describeUrlFailure, findMissingEnvName } from "./classify.js";
import type { UrlCheck, UrlTarget } from "./targets.js";

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
/**
 * How long a URL is retried when its last attempt timed out instead of being refused: something is listening but slow,
 * typically a dev server compiling on its first request (Vite), which can take longer than the usual deadline.
 */
export const URL_SLOW_DEADLINE_MS = 60_000;
const URL_CHECK_INTERVAL_MS = 500;
/** At most this many requests at once, so a large stack does not hit the gateway with every URL in the same instant. */
export const URL_CHECK_CONCURRENCY = 8;
const BODY_SAMPLE_BYTES = 512;

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
    slowDeadlineMs?: number;
    intervalMs?: number;
    concurrency?: number;
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
  const slowDeadlineMs = options.slowDeadlineMs ?? URL_SLOW_DEADLINE_MS;
  const startedAt = now();
  let deadline = startedAt + deadlineMs;

  const results = new Map<number, UrlProbe>();
  let pending = targets.map((target, index) => ({ target, index }));
  for (let attempt = 0; pending.length > 0; attempt++) {
    // Every URL is requested at least once. After that a retry starts only before the deadline and gets only the time left.
    const left = deadline - now();
    if (attempt > 0 && left <= 0) break;
    const budget = Math.max(1, Math.min(timeoutMs, left));
    const probed = await mapWithConcurrency(
      pending,
      options.concurrency ?? URL_CHECK_CONCURRENCY,
      async (entry) => ({ ...entry, result: await probe(entry.target.url, budget) }),
    );
    for (const { index, result } of probed) results.set(index, result);
    pending = probed
      .filter(({ target, result }) => !classifyProbe(result, target.url).didAnswer)
      .map(({ target, index }) => ({ target, index }));
    if (pending.some(({ index }) => results.get(index)?.error === "timeout")) {
      deadline = Math.max(deadline, startedAt + slowDeadlineMs);
    }
    const remaining = deadline - now();
    if (pending.length === 0 || remaining <= 0) break;
    await sleep(Math.min(intervalMs, remaining));
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
      const classified = classifyProbe(result, target.url);
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

/** `items.map(fn)` with at most `limit` calls in flight, results in input order. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
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
    if (check.message) lines.push(`      likely cause: ${check.message}`);
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
        // The certificate is checked as usual; one that does not verify is a request error (no-response), not an answer.
        ...(isHttps ? { servername: hostname } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        // Set when this side stops reading after the sample: a body that long is not one of Traefik's short error bodies, so
        // the status alone decides. Any other early end leaves the body unknown.
        let isSampled = false;
        const answer = () =>
          finish({
            status: res.statusCode,
            body: Buffer.concat(chunks).subarray(0, BODY_SAMPLE_BYTES).toString("utf-8"),
          });
        res.on("data", (chunk: Buffer) => {
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
          if (res.complete) answer();
          else finish({ error: "incomplete response" });
        };
        res.on("close", cutOff);
        res.on("error", cutOff);
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
