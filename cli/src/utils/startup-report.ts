// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { parseTiltResourceFailures, summarizeTiltBuildError } from "./doctor-runtime.js";
import { portConflictFix } from "./port-conflict-fix.js";
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
  };
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
  const blocked: StartupReport["blocked"] = [];
  const starting: string[] = [];
  for (const item of items) {
    const name = item.metadata?.name ?? "unknown";
    if (name === "(Tiltfile)" || failedNames.has(name) || deferred.has(name)) continue;
    const because = [...transitiveDependencies(name, dependsOn)]
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

export function formatStartupReport(report: StartupReport, timedOut: boolean): string[] {
  const lines: string[] = [];
  for (const { name, message } of report.failed) {
    lines.push(`✗ ${name} failed: ${message}`);
    const fix = portConflictFix(message);
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
