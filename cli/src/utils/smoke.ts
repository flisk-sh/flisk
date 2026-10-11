// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT

import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DiscoveredResource } from "../types/index.js";
import { BRING_YOUR_OWN_TYPE } from "./constants.js";
import { isApiServiceType } from "./resource-kind.js";
import { resolveServicePath, resolveSubdomainBases } from "./service-urls.js";

/**
 * A post-start check a service declares in service.json. It runs through the URL `tdk up` prints (Traefik), not inside the
 * container, so it catches what `healthCheckPath` cannot: a route Traefik never registered, a shared router, a database the
 * service is not actually using.
 */
export interface SmokeStep {
  name?: string;
  method?: string;
  /** Appended to the service's public base URL. Must start with `/`. `{{name}}` is replaced by a value saved by an earlier step. */
  path: string;
  body?: unknown;
  /** Expected HTTP status. Defaults to 200. */
  expect?: number;
  bodyContains?: string;
  /** Saves response fields for later steps: `{ "id": "$.id" }`. Supports `$.a.b[0]`. */
  save?: Record<string, string>;
}

export interface SmokeConfig {
  via: "proxy";
  timeoutSeconds?: number;
  steps: SmokeStep[];
}

export interface SmokePlan {
  name: string;
  baseUrl: string;
  /** Appended to `baseUrl` and polled with GET before the first step, so a write is never the first request to reach a service that is still starting. */
  readyPath?: string;
  smoke: SmokeConfig;
}

export interface SmokeResult {
  name: string;
  ok: boolean;
  failure?: string;
  /** Path of the `latest.json` of the step that failed, when a record was written. */
  recordPath?: string;
}

export interface SmokeDeps {
  fetch?: (
    url: string,
    init: { method: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
  ) => Promise<{ status: number; text(): Promise<string> }>;
  now?: () => number;
  /** Directory the per-step records go under (`<dir>/<service>/<step-slug>/`). No directory, no records. */
  recordDir?: string;
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_SMOKE_TIMEOUT_SECONDS = 60;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const BODY_SNIPPET_CHARS = 200;
/** Largest response body kept in a smoke record. */
export const SMOKE_RECORD_BODY_MAX_BYTES = 64 * 1024;
/** Statuses a proxy answers while a route or its upstream is not up yet. Anything else is the service's real answer. */
const NOT_READY_STATUSES = new Set([404, 502, 503, 504]);
/** Error codes that prove the request never left this machine, so repeating even a write is safe. */
const PRE_SEND_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A thrown request error is retried for safe methods, and for others only when its code shows the request was never sent. */
function shouldRetryRequestError(err: unknown, method: string): boolean {
  if (SAFE_METHODS.has(method)) return true;
  if (!isRecord(err)) return false;
  const cause = isRecord(err.cause) ? err.cause : undefined;
  const code = err.code ?? cause?.code;
  return typeof code === "string" && PRE_SEND_ERROR_CODES.has(code);
}

export function validateSmoke(smoke: unknown): string[] {
  if (!isRecord(smoke)) return ['smoke: must be an object with "via" and "steps"'];
  const errors: string[] = [];
  if (smoke.via !== "proxy") {
    errors.push('smoke.via: only "proxy" is supported (the check must go through the public URL)');
  }
  if (
    smoke.timeoutSeconds !== undefined &&
    !(typeof smoke.timeoutSeconds === "number" && smoke.timeoutSeconds > 0)
  ) {
    errors.push("smoke.timeoutSeconds: must be a number greater than 0");
  }
  if (!Array.isArray(smoke.steps) || smoke.steps.length === 0) {
    errors.push("smoke.steps: needs at least one step");
    return errors;
  }
  smoke.steps.forEach((step: unknown, index: number) => {
    const at = `smoke.steps[${index}]`;
    if (!isRecord(step)) {
      errors.push(`${at}: must be an object`);
      return;
    }
    const path = step.path;
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
      errors.push(
        `${at}.path: must start with "/" and is appended to the public URL; a full URL or relative path would skip the proxy`,
      );
    }
    if (
      step.expect !== undefined &&
      !(
        typeof step.expect === "number" &&
        Number.isInteger(step.expect) &&
        step.expect >= 100 &&
        step.expect <= 599
      )
    ) {
      errors.push(`${at}.expect: must be an HTTP status between 100 and 599`);
    }
    if (step.bodyContains !== undefined && typeof step.bodyContains !== "string") {
      errors.push(`${at}.bodyContains: must be a string`);
    }
    if (step.save !== undefined) {
      const ok =
        isRecord(step.save) &&
        Object.values(step.save).every((v) => typeof v === "string" && v.startsWith("$."));
      if (!ok) errors.push(`${at}.save: must map names to paths such as "$.id"`);
    }
  });
  return errors;
}

/** One plan per routable service that declares `smoke`. Workers and BYO with exposeViaProxy false have no public route. */
export function buildSmokePlans(
  resources: DiscoveredResource[],
  ingressPort?: number,
): SmokePlan[] {
  const { appBase, apiBase } = resolveSubdomainBases(ingressPort);
  const plans: SmokePlan[] = [];
  for (const resource of resources) {
    const config = resource.config;
    if (!config?.smoke) continue;
    const appType = config.appType;
    const isApi = isApiServiceType(appType) || appType === BRING_YOUR_OWN_TYPE;
    if (!isApi && appType !== "frontend") continue;
    if (config.exposeViaProxy === false) continue;
    const base = isApi ? apiBase : appBase;
    // The container healthcheck path (default /health for APIs) is the one request that is safe to repeat while the route comes up.
    const readyPath =
      config.healthCheckPath || (isApi && appType !== BRING_YOUR_OWN_TYPE ? "/health" : undefined);
    plans.push({
      name: resource.name,
      baseUrl: `${base}${resolveServicePath(resource).replace(/\/+$/, "")}`,
      ...(readyPath?.startsWith("/") ? { readyPath } : {}),
      smoke: config.smoke,
    });
  }
  return plans;
}

/** Caps each read-only smoke check so a doctor run cannot wait the full `tdk up` budget per service. */
const DOCTOR_SMOKE_TIMEOUT_SECONDS = 10;

/**
 * The GET-only part of each smoke block, for `tdk doctor`. Doctor must never write to a service, and a step whose path reads
 * a value saved by an earlier write (`{{name}}`) cannot run on its own, so both are dropped. A service with no such steps is left out.
 * `bodyContains` is also cleared: it asserts on data that earlier writes created, so doctor would fail a healthy route whose data was removed.
 * The status check stays, which is what shows a route exists.
 */
export function readOnlySmokePlans(
  plans: SmokePlan[],
  options: { timeoutSeconds?: number } = {},
): SmokePlan[] {
  const cap = options.timeoutSeconds ?? DOCTOR_SMOKE_TIMEOUT_SECONDS;
  return plans.flatMap((plan) => {
    const steps = plan.smoke.steps
      .filter(
        (step) =>
          (step.method ?? "GET").toUpperCase() === "GET" &&
          step.body === undefined &&
          !step.path.includes("{{"),
      )
      .map((step) => ({ ...step, bodyContains: undefined }));
    if (steps.length === 0) return [];
    const budget = Math.min(plan.smoke.timeoutSeconds ?? DEFAULT_SMOKE_TIMEOUT_SECONDS, cap);
    return [
      {
        name: plan.name,
        baseUrl: plan.baseUrl,
        smoke: { via: plan.smoke.via, timeoutSeconds: budget, steps },
      },
    ];
  });
}

function readPath(value: unknown, path: string): unknown {
  const parts = path.replace(/^\$\.?/, "").match(/[^.[\]]+/g) ?? [];
  let current: unknown = value;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    // Own properties only: a path like "__proto__" must not reach inherited values.
    if (part === "__proto__" || part === "constructor" || part === "prototype") return undefined;
    if (!Object.hasOwn(current, part)) return undefined;
    // Resolve only own data properties. Besides avoiding inherited properties, this
    // avoids invoking accessors on values supplied by smoke-test responses.
    const descriptor = Object.getOwnPropertyDescriptor(current, part);
    if (!descriptor || !("value" in descriptor)) return undefined;
    current = descriptor.value;
  }
  return current;
}

function fill(template: string, saved: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => saved[key] ?? match);
}

function fillBody(body: unknown, saved: Record<string, string>): unknown {
  if (typeof body === "string") return fill(body, saved);
  if (Array.isArray(body)) return body.map((item) => fillBody(item, saved));
  if (isRecord(body)) {
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, fillBody(v, saved)]));
  }
  return body;
}

function snippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > BODY_SNIPPET_CHARS ? `${flat.slice(0, BODY_SNIPPET_CHARS)}...` : flat;
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "step"
  );
}

/** Two steps whose names slug the same (`read back`, `read-back`) must not share a record directory. */
function stepKey(seen: Map<string, number>, label: string): string {
  const base = slug(label);
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

interface StepRecord {
  service: string;
  step: string;
  method: string;
  url: string;
  expectedStatus: number;
  status: number | null;
  error?: string;
  truncated: boolean;
  bodyBytes: number;
}

/** Writes latest.json (+ body.txt) for a step; a passing step also replaces the last-success pair. Returns the latest.json path. */
function writeStepRecord(
  recordDir: string,
  stepKey: string,
  record: StepRecord,
  body: string | undefined,
  passed: boolean,
): string | undefined {
  try {
    const dir = join(recordDir, slug(record.service), stepKey);
    mkdirSync(dir, { recursive: true });
    const latest = join(dir, "latest.json");
    const bodyPath = join(dir, "body.txt");
    if (body === undefined) {
      rmSync(bodyPath, { force: true });
    } else {
      writeFileSync(bodyPath, body);
    }
    writeFileSync(
      latest,
      `${JSON.stringify({ ...record, bodyPath: body === undefined ? null : "body.txt" }, null, 2)}\n`,
    );
    if (passed) {
      copyFileSync(latest, join(dir, "last-success.json"));
      if (body === undefined) rmSync(join(dir, "last-success-body.txt"), { force: true });
      else copyFileSync(bodyPath, join(dir, "last-success-body.txt"));
    }
    return latest;
  } catch {
    // The record is a diagnostic aid; failing to write it must not change the smoke result.
    return undefined;
  }
}

/** Caps a body at SMOKE_RECORD_BODY_MAX_BYTES of UTF-8 without splitting a character. */
function capBody(text: string): { body: string; truncated: boolean; bytes: number } {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= SMOKE_RECORD_BODY_MAX_BYTES)
    return { body: text, truncated: false, bytes: buf.length };
  const body = buf
    .subarray(0, SMOKE_RECORD_BODY_MAX_BYTES)
    .toString("utf8")
    .replace(/\uFFFD$/, "");
  return { body, truncated: true, bytes: Buffer.byteLength(body, "utf8") };
}

/** Runs the steps in order. A not-ready answer (connection error, 404, 502-504) is retried until the timeout; a real wrong answer fails at once. */
export async function runSmokePlan(plan: SmokePlan, deps: SmokeDeps = {}): Promise<SmokeResult> {
  const doFetch = deps.fetch ?? ((url, init) => fetch(url, init));
  const now = deps.now ?? Date.now;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const budgetMs = (plan.smoke.timeoutSeconds ?? DEFAULT_SMOKE_TIMEOUT_SECONDS) * 1000;
  let deadline = now() + budgetMs;
  const saved: Record<string, string> = {};

  // A manifest with errors is still loaded, so a malformed block must fail the check, not throw out of `tdk up`.
  const invalid = validateSmoke(plan.smoke);
  if (invalid.length > 0) {
    return {
      name: plan.name,
      ok: false,
      failure: `${plan.name}: invalid smoke block: ${invalid.join("; ")}`,
    };
  }

  // `tdk up` starts the check once Tilt's UI is up, while images may still be building. Traefik then resets or 404s early requests.
  // A write must not be repeated after a reset (it may have reached the service), so wait for readiness with GETs instead.
  // If the service never answers, fall through: the first step then fails with its own record.
  if (plan.readyPath) {
    const readyUrl = `${plan.baseUrl}${plan.readyPath}`;
    for (;;) {
      try {
        const response = await doFetch(readyUrl, {
          method: "GET",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        await response.text();
        // A 5xx from the health path (migrations running, database not up) is still "not ready"; 401 or 3xx means something answered.
        if (!NOT_READY_STATUSES.has(response.status) && response.status < 500) break;
      } catch {
        // not accepting connections yet
      }
      if (now() >= deadline) break;
      await sleep(RETRY_DELAY_MS);
    }
  }

  // The steps get their own `timeoutSeconds`; a slow build must not eat the first step's budget.
  deadline = now() + budgetMs;
  const stepKeys = new Map<string, number>();

  for (const [index, step] of plan.smoke.steps.entries()) {
    const label = step.name ?? `step ${index + 1}`;
    const method = (step.method ?? "GET").toUpperCase();
    const url = `${plan.baseUrl}${fill(step.path, saved)}`;
    const expected = step.expect ?? 200;
    const hasBody = step.body !== undefined;

    let status: number | undefined;
    let text = "";
    let error: string | undefined;
    let errorCode: string | undefined;
    for (;;) {
      error = undefined;
      errorCode = undefined;
      status = undefined;
      let retryableError = false;
      try {
        const response = await doFetch(url, {
          method,
          headers: hasBody ? { "content-type": "application/json" } : undefined,
          body: hasBody ? JSON.stringify(fillBody(step.body, saved)) : undefined,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        status = response.status;
        text = await response.text();
      } catch (err) {
        retryableError = shouldRetryRequestError(err, method);
        error = err instanceof Error ? err.message : String(err);
        const code = isRecord(err)
          ? (err.code ?? (isRecord(err.cause) ? err.cause.code : undefined))
          : undefined;
        errorCode = typeof code === "string" ? code : undefined;
      }
      const notReady =
        (error !== undefined && retryableError) ||
        (status !== undefined && status !== expected && NOT_READY_STATUSES.has(status));
      if (!notReady || now() >= deadline) break;
      await sleep(RETRY_DELAY_MS);
    }

    const where = `${plan.name}: ${label}: ${method} ${url}`;
    // Every step that ran leaves a record. A step is "passed" for last-success only if status and bodyContains both match.
    let recordPath: string | undefined;
    if (deps.recordDir) {
      const capped = status === undefined ? undefined : capBody(text);
      const passed =
        error === undefined &&
        status === expected &&
        (step.bodyContains === undefined || text.includes(step.bodyContains));
      recordPath = writeStepRecord(
        deps.recordDir,
        stepKey(stepKeys, label),
        {
          service: plan.name,
          step: label,
          method,
          url,
          expectedStatus: expected,
          status: status ?? null,
          ...(error === undefined ? {} : { error: errorCode ?? error }),
          truncated: capped?.truncated ?? false,
          bodyBytes: capped?.bytes ?? 0,
        },
        capped?.body,
        passed,
      );
    }
    const fail = (failure: string): SmokeResult => ({
      name: plan.name,
      ok: false,
      failure,
      recordPath,
    });
    if (error !== undefined) return fail(`${where} never answered (${error})`);
    if (status !== expected) {
      return fail(
        `${where} returned ${status}, expected ${expected}${text ? `: ${snippet(text)}` : ""}`,
      );
    }
    if (step.bodyContains !== undefined && !text.includes(step.bodyContains)) {
      return fail(
        `${where} returned ${status} but the body does not contain "${step.bodyContains}": ${snippet(text)}`,
      );
    }
    if (step.save) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return fail(`${where} returned a body that is not JSON, cannot save: ${snippet(text)}`);
      }
      for (const [key, path] of Object.entries(step.save)) {
        const value = readPath(parsed, path);
        if (value === undefined || value === null || typeof value === "object") {
          return fail(`${where} response has no ${path} to save as {{${key}}}: ${snippet(text)}`);
        }
        saved[key] = String(value);
      }
    }
  }
  return { name: plan.name, ok: true };
}

export function formatSmokeFailure(result: SmokeResult): string {
  return `Smoke check failed: ${result.failure}${result.recordPath ? ` (record: ${result.recordPath})` : ""}`;
}

/** Runs every plan side by side; each plan keeps its own timeout. */
export async function runSmokePlans(
  plans: SmokePlan[],
  deps: SmokeDeps = {},
): Promise<SmokeResult[]> {
  return Promise.all(plans.map((plan) => runSmokePlan(plan, deps)));
}
