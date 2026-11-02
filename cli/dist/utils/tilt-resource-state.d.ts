/**
 * A Tilt resource that is not built and running yet: still waiting (`pending`, `none`) or building right now
 * (`in_progress`). Readiness must treat all of these as not ready.
 */
export declare function isTiltResourcePending(updateStatus: string, runtimeStatus: string): boolean;
/**
 * A resource Flisk registers but never starts (`auto_init=False`, such as a compose service kept only so the file loads).
 * Tilt lists it with both statuses `none` and no build queued or deploy done, so it is waiting on nothing and must not
 * hold the stack back. Once it is queued or has deployed, it counts as pending again.
 */
export declare function isNeverStarted(status?: {
    lastDeployTime?: string | null;
    pendingBuildSince?: string | null;
    updateStatus?: string;
    runtimeStatus?: string;
}): boolean;
/** What a Tilt failure says when the container runs but Docker reports its health check as failing. */
export declare const UNHEALTHY_CONTAINER_MESSAGE = "container is running, but its health check is failing";
/**
 * Tilt's runtime status, corrected for Docker health. Tilt reports a running compose container as `ok` even while its
 * health check is still `starting` or has turned `unhealthy` (Tilt 0.37), so a Postgres that never accepts connections
 * would read as ready. Health `starting` is pending and `unhealthy` is an error; a container without a health check
 * keeps Tilt's status.
 */
export declare function effectiveRuntimeStatus(status?: {
    runtimeStatus?: string;
    composeResourceInfo?: {
        healthStatus?: string;
    };
}): string;
