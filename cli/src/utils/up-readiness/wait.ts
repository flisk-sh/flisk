// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { getDeferredResourceNames } from "../doctor-runtime.js";
import {
  evaluateTiltReadiness,
  findBuildingResourceNames,
  findPendingResourceNames,
  getDisabledHealthResourceNames,
  healthProbeCannotRun,
  type ReadinessResult,
} from "./evaluate.js";
import { formatTail, tiltGetUiResources, tiltResourceLogs } from "./format.js";
import { failureGraceFromEnv, trackFailingSince, withinFailureGrace } from "./grace.js";

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
    /** How long a runtime-only failure may recover before the wait gives up on it (FLISK_UP_FAILURE_GRACE_MS). */
    failureGraceMs?: number;
    now?: () => number;
    /** Whether a running service's health command cannot run at all (see `healthProbeCannotRun`). Asks Docker unless `fetchJson` is injected. */
    probeCannotRun?: (service: string) => boolean;
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
  const probeCannotRun =
    options.probeCannotRun ??
    (options.fetchJson && options.fetchJson !== tiltGetUiResources
      ? undefined
      : healthProbeCannotRun);
  const now = options.now ?? Date.now;
  const failureGraceMs =
    options.failureGraceMs ?? failureGraceFromEnv(process.env.FLISK_UP_FAILURE_GRACE_MS);
  const failingSince = new Map<string, number>();

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
        const evaluation = evaluateTiltReadiness(
          text,
          deferred,
          options.expected,
          disabledHealth,
          probeCannotRun,
        );
        last = evaluation.result;
        trackFailingSince(failingSince, last.failures, now());
        if (evaluation.settled && !withinFailureGrace(last, failingSince, now(), failureGraceMs)) {
          return last;
        }
        if (
          last.failures.length > 0 &&
          !withinFailureGrace(last, failingSince, now(), failureGraceMs) &&
          options.isStalled?.(text)
        ) {
          return last;
        }

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
