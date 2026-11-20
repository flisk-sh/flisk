import { healthCountedResources, unhealthyServiceNames } from "./status-groups.js";
/**
 * The services `--strict`, `wait` and other readiness gates fail on: the failing or still starting ones. Null when nothing
 * of the project is running (no state at all, or every service with a process of its own is unknown), which is also not
 * ready. A project with no services has nothing to wait for.
 */
export function strictNotReady(resources, states) {
    const counted = healthCountedResources(resources, states);
    if (counted.length === 0)
        return [];
    if (!counted.some((resource) => (states?.[resource.name]?.status ?? "unknown") !== "unknown")) {
        return null;
    }
    return unhealthyServiceNames(resources, states);
}
/**
 * A local-process run's answer to the readiness question agents read from `status --json`. It deliberately carries no
 * failures: a local run records each service's own state, which `status` and `wait` report per service instead.
 */
export function readinessFromNativeStates(states) {
    const entries = Object.entries(states);
    const isRunning = entries.some(([, state]) => state.status !== "unknown");
    if (!isRunning)
        return null;
    return {
        ready: entries.every(([, state]) => state.status === "ready"),
        failures: [],
        pending: entries.filter(([, state]) => state.status !== "ready").length,
        timedOut: false,
        enabled: entries.map(([name]) => name),
    };
}
