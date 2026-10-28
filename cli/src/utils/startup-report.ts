// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { parseTiltResourceFailures, summarizeTiltBuildError } from "./doctor-runtime.js";
import { conflictPort, portConflictFix } from "./port-conflict-fix.js";
import type { PortOccupant } from "./port-occupant.js";
import { effectiveRuntimeStatus, isTiltResourcePending } from "./tilt-resource-state.js";
import { onlyEnabledResources } from "./up-readiness.js";

export interface StartupReport {
  failed: Array<{ name: string; message: string }>;
  /**
   * Depending, directly or through other services, on something that failed. Such a service is not ready even when its
   * own container runs: Tilt starts dependents once a dependency's container runs, before its health check passes.
   */
  blocked: Array<{ name: string; because: string[] }>;
  /** Not ready with nothing failed upstream: still building or starting. */
  starting: string[];
}

interface Item {
  metadata?: { name?: string };
  status?: {
    updateStatus?: string;
    runtimeStatus?: string;
    composeResourceInfo?: { healthStatus?: string };
    /** Set by Tilt while a resource waits for its resource_deps, e.g. every service waiting on `init-networks`. */
    waiting?: { reason?: string; on?: Array<{ kind?: string; name?: string }> };
  };
}

/** The resources Tilt says this one is waiting for. */
function waitingOn(item: Item): string[] {
  return (item.status?.waiting?.on ?? [])
    .filter((ref) => (ref.kind ?? "UIResource") === "UIResource" && ref.name)
    .map((ref) => ref.name as string);
}

// Docker has no free subnet left for a new network (every project creates several and `flisk down` keeps them).
const NETWORK_POOL_EXHAUSTED = /all predefined address pools have been fully subnetted/i;

/**
 * Tilt's error for a failed local command is only "exit status 1"; the reason (for example Docker's "all predefined
 * address pools have been fully subnetted") is in the resource's log. Returns the fix for each failed resource whose
 * message or log names a known machine problem.
 */
export async function machineProblemFixes(
  failures: Array<{ name: string; message: string }>,
  fetchLogs: (name: string) => Promise<string | null>,
): Promise<Map<string, string>> {
  const fixes = new Map<string, string>();
  for (const { name, message } of failures.slice(0, 5)) {
    const fix = machineProblemFix(message) ?? machineProblemFix((await fetchLogs(name)) ?? "");
    if (fix) fixes.set(name, fix);
  }
  return fixes;
}

/** A plain fix for a failure message that names a known machine problem, or null. */
export function machineProblemFix(message: string): string | null {
  if (NETWORK_POOL_EXHAUSTED.test(message)) {
    return "Fix: Docker has no free network ranges left. Run `flisk doctor --fix --scope=machine` to remove the unused networks of every Flisk project (networks in use are kept), then run flisk up again";
  }
  return null;
}

export function transitiveDependencies(
  name: string,
  dependsOn: Record<string, string[]>,
): Set<string> {
  const seen = new Set<string>();
  const visit = (current: string): void => {
    for (const dep of dependsOn[current] ?? []) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      visit(dep);
    }
  };
  visit(name);
  return seen;
}

function isPending(item: Item): boolean {
  return isTiltResourcePending(
    item.status?.updateStatus ?? "",
    effectiveRuntimeStatus(item.status),
  );
}

export function buildStartupReport(
  jsonText: string,
  dependsOn: Record<string, string[]>,
  deferred: Set<string> = new Set(),
): StartupReport {
  const enabledJson = onlyEnabledResources(jsonText);
  const failures = parseTiltResourceFailures(enabledJson, deferred).failures;
  const failed = failures.map((failure) => ({
    name: failure.name,
    message: failure.error
      ? summarizeTiltBuildError(failure.error)
      : `${failure.updateStatus}/${failure.runtimeStatus}`,
  }));
  const failedNames = new Set(failed.map((entry) => entry.name));

  const items = (JSON.parse(enabledJson) as { items?: Item[] }).items ?? [];
  // service.json dependsOn, plus what Tilt reports as waited for (shared infrastructure such as init-networks, which no
  // service.json names).
  const deps: Record<string, string[]> = { ...dependsOn };
  for (const item of items) {
    const name = item.metadata?.name;
    if (!name) continue;
    const waits = waitingOn(item);
    if (waits.length > 0) deps[name] = [...new Set([...(deps[name] ?? []), ...waits])];
  }
  const blocked: StartupReport["blocked"] = [];
  const starting: string[] = [];
  for (const item of items) {
    const name = item.metadata?.name ?? "unknown";
    if (name === "(Tiltfile)" || failedNames.has(name) || deferred.has(name)) continue;
    const because = [...transitiveDependencies(name, deps)]
      .filter((dep) => failedNames.has(dep))
      .sort();
    if (because.length > 0) blocked.push({ name, because });
    else if (isPending(item)) starting.push(name);
  }
  return { failed, blocked, starting };
}

/** A failure exists and everything still pending is blocked by it, so waiting longer cannot help. */
export function isStartupStalled(
  jsonText: string,
  dependsOn: Record<string, string[]>,
  deferred: Set<string> = new Set(),
): boolean {
  const report = buildStartupReport(jsonText, dependsOn, deferred);
  return report.failed.length > 0 && report.starting.length === 0;
}

export function formatStartupReport(
  report: StartupReport,
  timedOut: boolean,
  occupantOf?: (port: number) => PortOccupant | null,
  machineFixes: Map<string, string> = new Map(),
): string[] {
  const lines: string[] = [];
  for (const { name, message } of report.failed) {
    lines.push(`✗ ${name} failed: ${message}`);
    const port = conflictPort(message);
    const fix =
      portConflictFix(message, port !== null && occupantOf ? occupantOf(port) : null) ??
      machineFixes.get(name) ??
      machineProblemFix(message);
    if (fix) lines.push(`  ${fix}`);
  }
  for (const { name, because } of report.blocked) {
    lines.push(`✗ ${name} is not ready because ${because.join(", ")} failed`);
  }
  if (report.starting.length > 0) {
    lines.push(
      `${timedOut ? "Timed out waiting for" : "Still starting:"} ${report.starting.join(", ")}`,
    );
  }
  if (lines.length > 0) {
    const causes = [...new Set(report.blocked.flatMap((entry) => entry.because))].sort();
    const count = report.blocked.length;
    const summary =
      count > 0
        ? `: ${causes.join(", ")} failed, so ${count} dependent ${count === 1 ? "service is" : "services are"} not ready`
        : "";
    lines.push(
      `The environment is not ready${summary}. Tilt is still running; inspect it or run: flisk down`,
    );
  }
  return lines;
}
