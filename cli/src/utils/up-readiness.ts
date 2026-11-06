// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile, execFileSync } from "node:child_process";
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
  /** `runtime` is true when the container is still running but its health check fails (it may still recover). */
  failures: Array<{ name: string; message: string; runtime?: boolean }>;
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
 * running containers are considered ready immediately. The same goes for a container Docker reports unhealthy when
 * `probeCannotRun` says its health command cannot run at all (see `healthProbeCannotRun`).
 */
export function onlyEnabledResources(
  jsonText: string,
  disabledHealth?: Set<string>,
  probeCannotRun?: (service: string) => boolean,
): string {
  const parsed = JSON.parse(jsonText) as { items?: Array<TiltItem> };
  const items = (parsed.items ?? [])
    .filter((item) => item.status?.disableStatus?.state !== "Disabled")
    .map((item) => {
      let current = item;
      if (current.status?.updateStatus === "not_applicable") {
        current = { ...current, status: { ...current.status, updateStatus: "ok" } };
      }
      const name = current.metadata?.name;
      const health = current.status?.composeResourceInfo?.healthStatus;
      if (
        name &&
        current.status?.composeResourceInfo &&
        ((disabledHealth?.has(name) ?? false) ||
          (health === "unhealthy" && probeCannotRun?.(name) === true))
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

/** One recorded health probe, as `docker inspect` lists it. */
interface HealthProbe {
  ExitCode?: number;
  Output?: string;
}

/**
 * True when a probe's own result shows it never ran the health command: exec form (`test: [CMD, curl, ...]`) is exit -1 with
 * Docker's "OCI runtime exec failed"; shell form is exit 127 with "not found" in the output, or exit 126 with "permission
 * denied" and the like. An exit code alone is not proof (a script that did run can exit 127 too), and a probe that timed out
 * also exits -1, without that output.
 */
function probeNeverRan(probe: HealthProbe): boolean {
  const output = probe.Output ?? "";
  if (probe.ExitCode === -1) return /OCI runtime exec failed/.test(output);
  if (probe.ExitCode === 127) return /not found/i.test(output);
  if (probe.ExitCode === 126) {
    return /permission denied|cannot execute|not executable|is a directory/i.test(output);
  }
  return false;
}

/**
 * True when the container of a Compose service is running and every health probe Docker recorded never ran its command (see
 * `probeNeverRan`), such as `curl` in an image without curl, as in LycheeOrg/Lychee's facial-recognition sidecar. Such a probe
 * says nothing about the app, so it must not fail `flisk up`. Docker keeps only the last five probes: for a shell-form probe
 * the whole failing streak must be inside that log, because an older real failure may have scrolled out of it. A probe that runs
 * and fails is a real failure. More than one container with the service name, or Docker not answering, is "no", never "yes".
 */
export function healthProbeCannotRun(service: string): boolean {
  try {
    const ids = execFileSync(
      "docker",
      ["ps", "-q", "--filter", `label=com.docker.compose.service=${service}`],
      { encoding: "utf-8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] },
    )
      .split("\n")
      .filter(Boolean);
    if (ids.length !== 1) return false;
    const state = JSON.parse(
      execFileSync("docker", ["inspect", "--format", "{{json .State}}", ids[0]], {
        encoding: "utf-8",
        timeout: 8000,
        stdio: ["ignore", "pipe", "ignore"],
      }),
    ) as { Status?: string; Health?: { FailingStreak?: number; Log?: HealthProbe[] | null } };
    const log = state.Health?.Log ?? [];
    if (state.Status !== "running" || log.length === 0 || !log.every(probeNeverRan)) return false;
    const shellForm = log.some((probe) => probe.ExitCode === 126 || probe.ExitCode === 127);
    return !(shellForm && (state.Health?.FailingStreak ?? 0) > log.length);
  } catch {
    return false;
  }
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
  probeCannotRun?: (service: string) => boolean,
): { result: ReadinessResult; settled: boolean } {
  const parsed = parseTiltResourceFailures(
    onlyEnabledResources(jsonText, disabledHealth, probeCannotRun),
    deferred,
  );
  // A `<service>-typecheck` resource runs on the host and is advisory: it reports type errors
  // in Tilt, it does not decide whether the stack is up. It must not fail the stack.
  const blocking = parsed.failures.filter((failure) => !isAdvisoryResource(failure.name));
  const unhealthyButRunning = unhealthyRunningNames(jsonText);
  let result: ReadinessResult = {
    ready: blocking.length === 0 && parsed.pendingCount === 0 && parsed.okCount > 0,
    failures: blocking.map((failure) => ({
      name: failure.name,
      message: failure.error || `${failure.updateStatus}/${failure.runtimeStatus}`,
      ...(unhealthyButRunning.has(failure.name) ? { runtime: true } : {}),
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
 * Containers that built and are running but whose health check fails. Unlike an exited container (a migrator that failed,
 * a crash) these can still turn healthy by themselves.
 */
function unhealthyRunningNames(jsonText: string): Set<string> {
  try {
    const parsed = JSON.parse(jsonText) as { items?: TiltItem[] };
    return new Set(
      (parsed.items ?? [])
        .filter(
          (item) =>
            item.status?.updateStatus !== "error" &&
            // A container that exited keeps its last health status; only a running one can still turn healthy.
            item.status?.runtimeStatus === "ok" &&
            (item.status as { composeResourceInfo?: { healthStatus?: string } } | undefined)
              ?.composeResourceInfo?.healthStatus === "unhealthy",
        )
        .map((item) => item.metadata?.name as string),
    );
  } catch {
    return new Set();
  }
}

/** How long `flisk up` keeps waiting on a container that built but is failing at runtime before it reports a failure. */
export const DEFAULT_FAILURE_GRACE_MS = 120_000;

/**
 * True while every failure is a runtime one (the container is running; its health check fails) and each of them began
 * less than `graceMs` ago. `failingSince` holds when each resource started failing, so a container that turns unhealthy
 * late gets its own full window instead of inheriting an earlier container's. A database on its first start initialises its data directory and fails its health check
 * for a while: `flisk up` used to print "db failed" and stop waiting, and a few minutes later every container was healthy.
 * A build error never recovers by itself, so it still ends the wait at once.
 */
export function withinFailureGrace(
  result: ReadinessResult,
  failingSince: ReadonlyMap<string, number>,
  now: number,
  graceMs: number,
): boolean {
  if (result.failures.length === 0) return false;
  return result.failures.every((failure) => {
    const since = failingSince.get(failure.name);
    return failure.runtime === true && since !== undefined && now - since < graceMs;
  });
}

/** Records when each currently failing resource started failing and forgets the ones that recovered. */
export function trackFailingSince(
  failingSince: Map<string, number>,
  failures: ReadinessResult["failures"],
  now: number,
): void {
  const current = new Set(failures.map((failure) => failure.name));
  for (const name of [...failingSince.keys()]) {
    if (!current.has(name)) failingSince.delete(name);
  }
  for (const name of current) {
    if (!failingSince.has(name)) failingSince.set(name, now);
  }
}

/** FLISK_UP_FAILURE_GRACE_MS when it is a finite, non-negative number; otherwise the default. */
export function failureGraceFromEnv(value: string | undefined): number {
  const parsed = value === undefined || value.trim() === "" ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_FAILURE_GRACE_MS;
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
