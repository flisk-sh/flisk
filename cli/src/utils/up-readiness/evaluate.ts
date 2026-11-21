// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import type { DiscoveredResource } from "../../types/index.js";
import { parseTiltResourceFailures } from "../doctor-runtime.js";
import { isHealthCheckDisabled } from "../service-manifest.js";
import { discoverResources } from "../services.js";
import { effectiveRuntimeStatus } from "../tilt-resource-state.js";

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
