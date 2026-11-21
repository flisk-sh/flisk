// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

/**
 * A post-start check a service declares in service.json. It runs through the URL `flisk up` prints (Traefik), not inside the
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
  /**
   * Masks the secret values the project knows about. Throwing means the text could not be masked safely, and the runner then
   * neither shows nor stores it.
   */
  redact?: (text: string) => string;
  /** Reports a problem that does not change the smoke result, such as a body that could not be stored safely. */
  warn?: (message: string) => void;
}

export const DEFAULT_SMOKE_TIMEOUT_SECONDS = 60;
/** Largest response body kept in a smoke record. */
export const SMOKE_RECORD_BODY_MAX_BYTES = 64 * 1024;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
