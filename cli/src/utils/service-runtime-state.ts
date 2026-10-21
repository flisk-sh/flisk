// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { ResourceStatus } from "../types/index.js";
import { buildStartupReport, transitiveDependencies } from "./startup-report.js";
import { effectiveRuntimeStatus, isTiltResourcePending } from "./tilt-resource-state.js";
import { onlyEnabledResources } from "./up-readiness.js";

export interface ServiceRuntimeState {
  status: ResourceStatus;
  /** Why the service is not ready: its own error, or the dependency that failed or is still starting. */
  reason?: string;
  /** Failed services this one depends on, directly or through others. */
  blockedBy?: string[];
}

interface Item {
  metadata?: { name?: string };
  status?: {
    updateStatus?: string;
    runtimeStatus?: string;
    composeResourceInfo?: { healthStatus?: string };
  };
}

/**
 * The one answer to "is this service ready?" for `flisk status` and `flisk ui`, from Tilt's resources and the `dependsOn`
 * in service.json. A service whose own process is up is still not ready while something it depends on has failed or
 * is still starting. Services Tilt does not list are absent: the caller shows them as unknown.
 */
export function deriveServiceStates(
  jsonText: string,
  dependsOn: Record<string, string[]>,
  deferred: Set<string> = new Set(),
): Record<string, ServiceRuntimeState> {
  const report = buildStartupReport(jsonText, dependsOn, deferred);
  const failed = new Map(report.failed.map((entry) => [entry.name, entry.message]));
  const blocked = new Map(report.blocked.map((entry) => [entry.name, entry.because]));
  const starting = new Set(report.starting);

  const items = (JSON.parse(onlyEnabledResources(jsonText)) as { items?: Item[] }).items ?? [];
  const direct = new Map<string, ServiceRuntimeState>();
  for (const item of items) {
    const name = item.metadata?.name;
    if (!name || name === "(Tiltfile)") continue;
    if (failed.has(name)) {
      direct.set(name, { status: "error", reason: failed.get(name) });
    } else if (blocked.has(name)) {
      const because = blocked.get(name) ?? [];
      direct.set(name, {
        status: "error",
        reason: `${because.join(", ")} failed`,
        blockedBy: because,
      });
    } else if (starting.has(name)) {
      direct.set(name, { status: "pending" });
    } else if (
      deferred.has(name) &&
      isTiltResourcePending(item.status?.updateStatus ?? "", effectiveRuntimeStatus(item.status))
    ) {
      direct.set(name, { status: "unknown", reason: "starts on its first request" });
    } else {
      direct.set(name, { status: "ready" });
    }
  }

  const result: Record<string, ServiceRuntimeState> = {};
  for (const [name, state] of direct) {
    if (state.status !== "ready") {
      result[name] = state;
      continue;
    }
    const deps = [...transitiveDependencies(name, dependsOn)].filter((dep) => direct.has(dep));
    const failedDeps = deps.filter((dep) => direct.get(dep)?.status === "error").sort();
    const waitingDeps = deps.filter((dep) => direct.get(dep)?.status === "pending").sort();
    if (failedDeps.length > 0) {
      result[name] = {
        status: "error",
        reason: `${failedDeps.join(", ")} failed`,
        blockedBy: failedDeps,
      };
    } else if (waitingDeps.length > 0) {
      result[name] = { status: "pending", reason: `waiting for ${waitingDeps.join(", ")}` };
    } else {
      result[name] = state;
    }
  }
  return result;
}
