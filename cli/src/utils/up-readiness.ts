// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile } from "node:child_process";
import type { DiscoveredResource } from "../types/index.js";
import {
  findStaleDisabledResources,
  getDeferredResourceNames,
  parseTiltResourceFailures,
} from "./doctor-runtime.js";
import { isHealthCheckDisabled } from "./service-manifest.js";
import { discoverResources } from "./services.js";
import { effectiveRuntimeStatus } from "./tilt-resource-state.js";
import { findOnPath } from "./which.js";

export { findStaleDisabledResources };

export interface ReadinessResult {
  ready: boolean;
  failures: Array<{ name: string; message: string }>;
  pending: number;
  timedOut: boolean;
  /** Names of the resources Tilt has enabled (everything not `Disabled`), so callers report what actually started. */
  enabled: string[];
  /** Names of services that were still building when the timeout occurred. */
  stillBuilding?: string[];
  /** Last log lines of services that timed out before becoming ready. */
  lastLogs?: Record<string, string>;
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

export function tiltResourceLogs(port: number, name: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      findOnPath("tilt") ?? "tilt",
      ["logs", name, "--port", String(port)],
      { timeout: 15_000, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => resolve(error ? null : stdout),
    );
  });
}

interface TiltItem {
  metadata?: { name?: string };
  status?: {
    disableStatus?: { state?: string };
    updateStatus?: string;
    runtimeStatus?: string;
    composeResourceInfo?: { healthStatus?: string };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Tilt lists resources outside the current focus (the other release phases, or everything but a `--only` selection) with
 * `disableStatus.state: Disabled` and both statuses `none`, which would read as pending forever. A resource whose update
 * status is `not_applicable` (a serve-only local resource) has nothing to build, so it counts as built.
 * When health checks are disabled for a resource (`disabledHealth`), its container health check status is stripped so
 * running containers are considered ready immediately.
 */
export function onlyEnabledResources(jsonText: string, disabledHealth?: Set<string>): string {
  const parsed = JSON.parse(jsonText) as { items?: Array<TiltItem> };
  const items = (parsed.items ?? [])
    .filter((item) => item.status?.disableStatus?.state !== "Disabled")
    .map((item) => {
      let current = item;
      if (current.status?.updateStatus === "not_applicable") {
        current = { ...current, status: { ...current.status, updateStatus: "ok" } };
      }
      if (
        disabledHealth &&
        current.metadata?.name &&
        disabledHealth.has(current.metadata.name) &&
        current.status?.composeResourceInfo
      ) {
        const { healthStatus: _healthStatus, ...restInfo } = current.status.composeResourceInfo as {
          healthStatus?: string;
          [k: string]: unknown;
        };
        current = {
          ...current,
          status: {
            ...current.status,
            composeResourceInfo: restInfo,
          },
        };
      }
      return current;
    });
  return JSON.stringify({ items });
}

export function getDisabledHealthResourceNames(resources?: DiscoveredResource[]): Set<string> {
  try {
    const list = resources ?? discoverResources();
    return new Set(list.filter((svc) => isHealthCheckDisabled(svc.config)).map((svc) => svc.name));
  } catch {
    return new Set();
  }
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

/** Resources that report on the stack without gating it. */
export function isAdvisoryResource(name: string): boolean {
  return name.endsWith("-typecheck");
}

/**
 * One look at `tilt get uiresources -o json`. `settled` means polling can stop: everything is ready, or the rest has
 * finished with a failure (an errored resource, or an expected service Tilt has disabled).
 */
export function evaluateTiltReadiness(
  jsonText: string,
  deferred: Set<string>,
  expected?: string[],
  disabledHealth?: Set<string>,
): { result: ReadinessResult; settled: boolean } {
  const parsed = parseTiltResourceFailures(
    onlyEnabledResources(jsonText, disabledHealth),
    deferred,
  );
  // A `<service>-typecheck` resource runs on the host and is advisory: it reports type errors
  // in Tilt, it does not decide whether the stack is up. It must not fail the stack.
  const blocking = parsed.failures.filter((failure) => !isAdvisoryResource(failure.name));
  let result: ReadinessResult = {
    ready: blocking.length === 0 && parsed.pendingCount === 0 && parsed.okCount > 0,
    failures: blocking.map((failure) => ({
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

export function findBuildingResourceNames(jsonText: string, deferred?: Set<string>): string[] {
  try {
    const parsed = JSON.parse(jsonText) as { items?: TiltItem[] };
    return (parsed.items ?? [])
      .filter((item) => {
        const name = item.metadata?.name;
        if (!name || name === "(Tiltfile)" || deferred?.has(name) || isAdvisoryResource(name)) {
          return false;
        }
        if (item.status?.disableStatus?.state === "Disabled") return false;
        return item.status?.updateStatus === "in_progress";
      })
      .map((item) => item.metadata?.name as string);
  } catch {
    return [];
  }
}

export function findPendingResourceNames(jsonText: string, deferred?: Set<string>): string[] {
  try {
    const parsed = JSON.parse(jsonText) as { items?: TiltItem[] };
    return (parsed.items ?? [])
      .filter((item) => {
        const name = item.metadata?.name;
        if (!name || name === "(Tiltfile)" || deferred?.has(name) || isAdvisoryResource(name)) {
          return false;
        }
        if (item.status?.disableStatus?.state === "Disabled") return false;
        const update = item.status?.updateStatus ?? "";
        const runtime = effectiveRuntimeStatus(item.status);
        if (update === "error" || runtime === "error") return false;
        return update !== "ok" || runtime !== "ok";
      })
      .map((item) => item.metadata?.name as string);
  } catch {
    return [];
  }
}

export function formatTail(text: string, maxLines = 10): string {
  const lines = text
    .trimEnd()
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  return lines.slice(-maxLines).join("\n");
}

function stateFingerprint(jsonText: string): string {
  try {
    const parsed = JSON.parse(jsonText) as {
      items?: Array<{
        metadata?: { name?: string };
        status?: {
          updateStatus?: string;
          runtimeStatus?: string;
          disableStatus?: { state?: string };
          composeResourceInfo?: { healthStatus?: string };
          currentBuild?: { startTime?: string };
          buildHistory?: Array<{ error?: string }>;
        };
      }>;
    };
    return (parsed.items ?? [])
      .map((i) => {
        const s = i.status;
        return `${i.metadata?.name}:${s?.updateStatus}:${s?.runtimeStatus}:${s?.disableStatus?.state}:${s?.composeResourceInfo?.healthStatus}:${s?.currentBuild?.startTime}:${s?.buildHistory?.length}`;
      })
      .join(";");
  } catch {
    return jsonText;
  }
}

/**
 * Waits until every non-deferred Tilt resource is built and running. Resolves not-ready as soon as the rest has settled
 * with an errored resource, or after a period of no progress (progress-aware timeout). While builds or image pulls
 * produce output, the wait does not time out. Sablier-deferred resources are excluded: they stay idle by design.
 */
export async function waitForTiltResourcesReady(
  port: number,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    fetchJson?: (port: number) => Promise<string | null>;
    fetchLogs?: (port: number, name: string) => Promise<string | null>;
    deferred?: Set<string>;
    /** Resource names that must be present, enabled, and ready (a `--only` selection). */
    expected?: string[];
    /** Called with Tilt's JSON while something has failed: true means nothing left pending can still progress. */
    isStalled?: (jsonText: string) => boolean;
    /** Resource names whose health checks are disabled. */
    disabledHealth?: Set<string>;
    now?: () => number;
  } = {},
): Promise<ReadinessResult> {
  const timeoutMs = options.timeoutMs ?? Number(process.env.FLISK_UP_READY_TIMEOUT_MS ?? 900_000);
  const intervalMs = options.intervalMs ?? 2_000;
  const fetchJson = options.fetchJson ?? tiltGetUiResources;
  const fetchLogs =
    options.fetchLogs ??
    (options.fetchJson && options.fetchJson !== tiltGetUiResources
      ? async () => null
      : tiltResourceLogs);
  const deferred = options.deferred ?? getDeferredResourceNames();
  const disabledHealth = options.disabledHealth ?? getDisabledHealthResourceNames();
  const now = options.now ?? Date.now;

  let lastProgressAt = now();
  let previousFingerprint = "";
  const previousLogLengths = new Map<string, number>();
  let lastJsonText: string | null = null;

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
      lastJsonText = text;
      try {
        const evaluation = evaluateTiltReadiness(text, deferred, options.expected, disabledHealth);
        last = evaluation.result;
        if (evaluation.settled) return last;
        if (last.failures.length > 0 && options.isStalled?.(text)) return last;

        const currentFingerprint = stateFingerprint(text);
        if (currentFingerprint !== previousFingerprint) {
          previousFingerprint = currentFingerprint;
          lastProgressAt = now();
        } else {
          // While building, check if active builds are producing output.
          const building = findBuildingResourceNames(text, deferred);
          if (building.length > 0) {
            for (const name of building) {
              const logs = await fetchLogs(port, name);
              if (logs !== null) {
                const prev = previousLogLengths.get(name);
                if (prev === undefined || logs.length !== prev) {
                  previousLogLengths.set(name, logs.length);
                  lastProgressAt = now();
                }
              }
            }
          }
        }
      } catch {
        /* Tilt may emit partial output while starting; retry. */
      }
    }
    if (now() - lastProgressAt >= timeoutMs) {
      const stillBuilding = lastJsonText ? findBuildingResourceNames(lastJsonText, deferred) : [];
      const pendingNames = lastJsonText ? findPendingResourceNames(lastJsonText, deferred) : [];
      const unfinished = [...new Set([...stillBuilding, ...pendingNames])];
      const lastLogs: Record<string, string> = {};
      for (const name of unfinished) {
        try {
          const logs = await fetchLogs(port, name);
          if (logs && logs.trim().length > 0) {
            lastLogs[name] = formatTail(logs, 10);
          }
        } catch {
          // Ignore log retrieval failure on timeout
        }
      }
      return {
        ...last,
        ready: false,
        timedOut: true,
        stillBuilding,
        lastLogs: Object.keys(lastLogs).length > 0 ? lastLogs : undefined,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
