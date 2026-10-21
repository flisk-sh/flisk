// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile } from "node:child_process";
import { getDeferredResourceNames, parseTiltResourceFailures } from "./doctor-runtime.js";
import { findOnPath } from "./which.js";

export interface ReadinessResult {
  ready: boolean;
  failures: Array<{ name: string; message: string }>;
  pending: number;
  timedOut: boolean;
  /** Names of the resources Tilt has enabled (everything not `Disabled`), so callers report what actually started. */
  enabled: string[];
}

export function tiltGetUiResources(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      findOnPath("tilt") ?? "tilt",
      ["get", "uiresources", "-o", "json", "--port", String(port)],
      { timeout: 15_000, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => resolve(error ? null : stdout),
    );
  });
}

interface TiltItem {
  metadata?: { name?: string };
  status?: { disableStatus?: { state?: string }; updateStatus?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/**
 * Tilt lists resources outside the current focus (the other release phases, or everything but a `--only` selection) with
 * `disableStatus.state: Disabled` and both statuses `none`, which would read as pending forever. A resource whose update
 * status is `not_applicable` (a serve-only local resource) has nothing to build, so it counts as built.
 */
export function onlyEnabledResources(jsonText: string): string {
  const parsed = JSON.parse(jsonText) as { items?: Array<TiltItem> };
  const items = (parsed.items ?? [])
    .filter((item) => item.status?.disableStatus?.state !== "Disabled")
    .map((item) =>
      item.status?.updateStatus === "not_applicable"
        ? { ...item, status: { ...item.status, updateStatus: "ok" } }
        : item,
    );
  return JSON.stringify({ items });
}

function enabledNames(jsonText: string): string[] {
  return ((JSON.parse(jsonText) as { items?: TiltItem[] }).items ?? [])
    .filter((item) => item.status?.disableStatus?.state !== "Disabled")
    .flatMap((item) => (item.metadata?.name ? [item.metadata.name] : []));
}

/**
 * Services the caller asked for must not vanish into the disabled filter: one that Tilt lists as disabled (it can be
 * disabled while running) is a failure, and one Tilt does not list yet is still pending.
 */
export function checkExpectedResources(
  jsonText: string,
  expected: string[],
): { missing: string[]; disabled: string[] } {
  const items = (JSON.parse(jsonText) as { items?: TiltItem[] }).items ?? [];
  const byName = new Map(items.map((item) => [item.metadata?.name, item]));
  return {
    missing: expected.filter((name) => !byName.has(name)),
    disabled: expected.filter(
      (name) => byName.get(name)?.status?.disableStatus?.state === "Disabled",
    ),
  };
}

/**
 * One look at `tilt get uiresources -o json`. `settled` means polling can stop: everything is ready, or the rest has
 * finished with a failure (an errored resource, or an expected service Tilt has disabled).
 */
export function evaluateTiltReadiness(
  jsonText: string,
  deferred: Set<string>,
  expected?: string[],
): { result: ReadinessResult; settled: boolean } {
  const parsed = parseTiltResourceFailures(onlyEnabledResources(jsonText), deferred);
  let result: ReadinessResult = {
    ready: parsed.failures.length === 0 && parsed.pendingCount === 0 && parsed.okCount > 0,
    failures: parsed.failures.map((failure) => ({
      name: failure.name,
      message: failure.error || `${failure.updateStatus}/${failure.runtimeStatus}`,
    })),
    pending: parsed.pendingCount,
    timedOut: false,
    enabled: enabledNames(jsonText),
  };
  if (expected && expected.length > 0) {
    const { missing, disabled } = checkExpectedResources(jsonText, expected);
    if (missing.length > 0) {
      result = { ...result, ready: false, pending: result.pending + missing.length };
    }
    if (disabled.length > 0) {
      return {
        settled: true,
        result: {
          ...result,
          ready: false,
          failures: [
            ...result.failures,
            ...disabled.map((name) => ({ name, message: "disabled in Tilt" })),
          ],
        },
      };
    }
  }
  return {
    result,
    settled: result.ready || (result.failures.length > 0 && result.pending === 0),
  };
}

/**
 * Waits until every non-deferred Tilt resource is built and running. Resolves not-ready as soon as the rest has settled
 * with an errored resource, or at the deadline. Sablier-deferred resources are excluded: they stay idle by design.
 */
export async function waitForTiltResourcesReady(
  port: number,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    fetchJson?: (port: number) => Promise<string | null>;
    deferred?: Set<string>;
    /** Resource names that must be present, enabled, and ready (a `--only` selection). */
    expected?: string[];
    /** Called with Tilt's JSON while something has failed: true means nothing left pending can still progress. */
    isStalled?: (jsonText: string) => boolean;
  } = {},
): Promise<ReadinessResult> {
  const timeoutMs = options.timeoutMs ?? Number(process.env.TDK_UP_READY_TIMEOUT_MS ?? 900_000);
  const intervalMs = options.intervalMs ?? 2_000;
  const fetchJson = options.fetchJson ?? tiltGetUiResources;
  const deferred = options.deferred ?? getDeferredResourceNames();
  const deadline = Date.now() + timeoutMs;
  let last: ReadinessResult = {
    ready: false,
    failures: [],
    pending: 0,
    timedOut: false,
    enabled: [],
  };
  for (;;) {
    const text = await fetchJson(port);
    if (text) {
      try {
        const evaluation = evaluateTiltReadiness(text, deferred, options.expected);
        last = evaluation.result;
        if (evaluation.settled) return last;
        if (last.failures.length > 0 && options.isStalled?.(text)) return last;
      } catch {
        /* Tilt may emit partial output while starting; retry. */
      }
    }
    if (Date.now() >= deadline) return { ...last, ready: false, timedOut: true };
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
