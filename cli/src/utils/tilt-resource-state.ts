// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * A Tilt resource that is not built and running yet: still waiting (`pending`, `none`) or building right now
 * (`in_progress`). Readiness must treat all of these as not ready.
 */
export function isTiltResourcePending(updateStatus: string, runtimeStatus: string): boolean {
  return (
    updateStatus === "pending" ||
    updateStatus === "in_progress" ||
    updateStatus === "none" ||
    runtimeStatus === "pending" ||
    runtimeStatus === "none"
  );
}

/**
 * A resource Flisk registers but never starts (`auto_init=False`, such as a compose service kept only so the file loads).
 * Tilt lists it with both statuses `none` and no build queued or deploy done, so it is waiting on nothing and must not
 * hold the stack back. Once it is queued or has deployed, it counts as pending again.
 */
export function isNeverStarted(status?: {
  lastDeployTime?: string | null;
  pendingBuildSince?: string | null;
  updateStatus?: string;
  runtimeStatus?: string;
}): boolean {
  return (
    status?.updateStatus === "none" &&
    status?.runtimeStatus === "none" &&
    !status?.lastDeployTime &&
    !status?.pendingBuildSince
  );
}

/** What a Tilt failure says when the container runs but Docker reports its health check as failing. */
export const UNHEALTHY_CONTAINER_MESSAGE = "container is running, but its health check is failing";

/**
 * Tilt's runtime status, corrected for Docker health. Tilt reports a running compose container as `ok` even while its
 * health check is still `starting` or has turned `unhealthy` (Tilt 0.37), so a Postgres that never accepts connections
 * would read as ready. Health `starting` is pending and `unhealthy` is an error; a container without a health check
 * keeps Tilt's status.
 */
export function effectiveRuntimeStatus(status?: {
  runtimeStatus?: string;
  composeResourceInfo?: { healthStatus?: string };
}): string {
  const runtimeStatus = status?.runtimeStatus ?? "";
  if (runtimeStatus !== "ok") return runtimeStatus;
  const health = status?.composeResourceInfo?.healthStatus;
  if (health === "unhealthy") return "error";
  if (health === "starting") return "pending";
  return runtimeStatus;
}

/**
 * A resource running but failing its health check: runtimeStatus is "ok" (container is up) but healthStatus is
 * "unhealthy" (Docker health check failing). This may recover, so we show it as "starting" rather than "failed".
 */
export function isUnhealthyButRunning(status?: {
  runtimeStatus?: string;
  composeResourceInfo?: { healthStatus?: string };
}): boolean {
  return (
    status?.runtimeStatus === "ok" && status?.composeResourceInfo?.healthStatus === "unhealthy"
  );
}
