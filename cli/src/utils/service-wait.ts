// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { DiscoveredResource, ServiceRuntimeState } from "../types/index.js";
import { formatCount } from "./formatting.js";
import { strictNotReady } from "./service-readiness.js";
import { findUnknownServices } from "./up-only.js";
import type { ReadinessResult } from "./up-readiness.js";
import type { UnhealthyLogTail } from "./up-wait.js";

export type ServiceWaitState = "ready" | "failed" | "timeout" | "unknown-service";

/** One service's state in the single envelope `flisk wait --json` prints. */
export interface WaitServiceState extends ServiceRuntimeState {
  name: string;
  /** The last log lines, present for a service that failed or was still starting when the wait ended. */
  logs?: string[];
}

export interface WaitFailure {
  name: string;
  message: string;
}

export interface ServiceWaitOutcome {
  state: ServiceWaitState;
  ready: boolean;
  services: WaitServiceState[];
  /** Failing and still-starting services, in a stable order. */
  unhealthy: string[];
  failures: WaitFailure[];
  /** Names that matched no discovered resource, only when `state` is `unknown-service`. */
  unknown?: string[];
  message: string;
}

/** What one look at the running stack knows. `settled` means another look cannot change the answer. */
export interface ServiceWaitSnapshot {
  states: Record<string, ServiceRuntimeState>;
  /** The same readiness object `up --wait` and `status --json` evaluate. */
  readiness?: ReadinessResult | null;
  settled?: boolean;
}

export interface ServiceWaitDeps {
  snapshot: () => Promise<ServiceWaitSnapshot> | ServiceWaitSnapshot;
  /** The log tails `up --wait` prints, fetched only when the wait ends without being ready. */
  fetchLogTails?: (names: readonly string[]) => Promise<UnhealthyLogTail[]>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
}

const DEFAULT_INTERVAL_MS = 500;

function selectedResources(
  resources: readonly DiscoveredResource[],
  requested: readonly string[],
): DiscoveredResource[] {
  if (requested.length === 0) return [...resources];
  const names = new Set(requested);
  return resources.filter((resource) => names.has(resource.name));
}

function failuresOf(
  snapshot: ServiceWaitSnapshot,
  selected: readonly DiscoveredResource[],
): WaitFailure[] {
  const names = new Set(selected.map((resource) => resource.name));
  const found = new Map<string, string>();
  for (const failure of snapshot.readiness?.failures ?? []) {
    if (!names.has(failure.name) && failure.name !== "(Tiltfile)") continue;
    found.set(failure.name, failure.message || "not ready");
  }
  for (const resource of selected) {
    const state = snapshot.states[resource.name];
    if (state?.status === "error" && !found.has(resource.name)) {
      found.set(resource.name, state.reason || "failed");
    }
  }
  return [...found].map(([name, message]) => ({ name, message }));
}

function statesOf(
  snapshot: ServiceWaitSnapshot,
  selected: readonly DiscoveredResource[],
  failures: readonly WaitFailure[],
): WaitServiceState[] {
  const services = selected.map((resource) => {
    const state = snapshot.states[resource.name] ?? { status: "unknown" as const };
    return { name: resource.name, ...state };
  });
  for (const failure of failures) {
    if (!services.some((service) => service.name === failure.name)) {
      services.push({ name: failure.name, status: "error", reason: failure.message });
    }
  }
  for (const service of services) {
    const failure = failures.find((entry) => entry.name === service.name);
    if (failure && service.status === "error" && !service.reason) service.reason = failure.message;
  }
  return services;
}

function outcome(
  state: ServiceWaitState,
  snapshot: ServiceWaitSnapshot,
  selected: readonly DiscoveredResource[],
  failures: readonly WaitFailure[],
  unhealthy: readonly string[],
  timeoutSeconds: number,
  unknown: readonly string[] = [],
): ServiceWaitOutcome {
  const services = statesOf(snapshot, selected, failures);
  const message =
    state === "ready"
      ? `All ${formatCount(services.length, "service")} are healthy.`
      : state === "failed"
        ? `${formatCount(failures.length, "service")} failed: ${failures.map((failure) => failure.name).join(", ")}`
        : state === "timeout"
          ? `Timed out after ${timeoutSeconds}s waiting for ${formatCount(unhealthy.length, "service")}: ${unhealthy.join(", ")}`
          : `Unknown service ${unknown.join(", ")}.`;
  return {
    state,
    ready: state === "ready",
    services,
    unhealthy: [...unhealthy],
    failures: [...failures],
    ...(unknown.length > 0 ? { unknown: [...unknown] } : {}),
    message,
  };
}

async function withLogs(
  result: ServiceWaitOutcome,
  fetchLogTails: ServiceWaitDeps["fetchLogTails"],
): Promise<ServiceWaitOutcome> {
  if (result.ready || !fetchLogTails || result.unhealthy.length === 0) return result;
  let tails: UnhealthyLogTail[];
  try {
    tails = await fetchLogTails(result.unhealthy);
  } catch {
    // A log lookup must not hide the readiness answer.
    return result;
  }
  const byName = new Map(tails.map((tail) => [tail.name, tail.lines]));
  const services = result.services.map((service) => {
    const lines = byName.get(service.name);
    return lines === undefined ? service : { ...service, logs: lines };
  });
  return { ...result, services };
}

/**
 * Waits until the selected services are ready, using a snapshot provider backed by the same readiness evaluation as
 * `up --wait` and `status`. It only reads: the caller's snapshot and log lookup decide where the state comes from.
 */
export async function waitForServices(
  resources: readonly DiscoveredResource[],
  requested: readonly string[],
  timeoutSeconds: number,
  deps: ServiceWaitDeps,
): Promise<ServiceWaitOutcome> {
  const unknown = findUnknownServices([...requested], [...resources]);
  if (unknown.length > 0) {
    return outcome("unknown-service", { states: {} }, [], [], [], timeoutSeconds, unknown);
  }

  const selected = selectedResources(resources, requested);
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  const deadline = now() + timeoutSeconds * 1000;
  let last: ServiceWaitSnapshot = { states: {} };

  for (;;) {
    last = await deps.snapshot();
    const failures = failuresOf(last, selected);
    const notReady = strictNotReady(selected, last.states);
    const unhealthy = [
      ...new Set([...failures.map((failure) => failure.name), ...(notReady ?? [])]),
    ];
    const ready =
      failures.length === 0 && notReady?.length === 0 && last.readiness?.ready !== false;

    if (ready) return outcome("ready", last, selected, failures, unhealthy, timeoutSeconds);
    if (failures.length > 0) {
      return withLogs(
        outcome("failed", last, selected, failures, unhealthy, timeoutSeconds),
        deps.fetchLogTails,
      );
    }
    if (last.readiness?.timedOut === true || last.settled === true) {
      return withLogs(
        outcome(
          "timeout",
          last,
          selected,
          failures,
          unhealthy.length > 0 ? unhealthy : selected.map((resource) => resource.name),
          timeoutSeconds,
        ),
        deps.fetchLogTails,
      );
    }
    if (now() >= deadline) {
      return withLogs(
        outcome(
          "timeout",
          last,
          selected,
          failures,
          unhealthy.length > 0 ? unhealthy : selected.map((resource) => resource.name),
          timeoutSeconds,
        ),
        deps.fetchLogTails,
      );
    }
    await sleep(intervalMs);
  }
}
