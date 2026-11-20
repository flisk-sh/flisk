import { formatCount } from "./formatting.js";
import { strictNotReady } from "./service-readiness.js";
import { findUnknownServices } from "./up-only.js";
const DEFAULT_INTERVAL_MS = 500;
function selectedResources(resources, requested) {
    if (requested.length === 0)
        return [...resources];
    const names = new Set(requested);
    return resources.filter((resource) => names.has(resource.name));
}
function failuresOf(snapshot, selected) {
    const names = new Set(selected.map((resource) => resource.name));
    const found = new Map();
    for (const failure of snapshot.readiness?.failures ?? []) {
        if (!names.has(failure.name) && failure.name !== "(Tiltfile)")
            continue;
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
function statesOf(snapshot, selected, failures) {
    const services = selected.map((resource) => {
        const state = snapshot.states[resource.name] ?? { status: "unknown" };
        return { name: resource.name, ...state };
    });
    for (const failure of failures) {
        if (!services.some((service) => service.name === failure.name)) {
            services.push({ name: failure.name, status: "error", reason: failure.message });
        }
    }
    for (const service of services) {
        const failure = failures.find((entry) => entry.name === service.name);
        if (failure && service.status === "error" && !service.reason)
            service.reason = failure.message;
    }
    return services;
}
function outcome(state, snapshot, selected, failures, unhealthy, timeoutSeconds, unknown = []) {
    const services = statesOf(snapshot, selected, failures);
    const message = state === "ready"
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
async function withLogs(result, fetchLogTails) {
    if (result.ready || !fetchLogTails || result.unhealthy.length === 0)
        return result;
    let tails;
    try {
        tails = await fetchLogTails(result.unhealthy);
    }
    catch {
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
export async function waitForServices(resources, requested, timeoutSeconds, deps) {
    const unknown = findUnknownServices([...requested], [...resources]);
    if (unknown.length > 0) {
        return outcome("unknown-service", { states: {} }, [], [], [], timeoutSeconds, unknown);
    }
    const selected = selectedResources(resources, requested);
    const now = deps.now ?? Date.now;
    const sleep = deps.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
    const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
    const deadline = now() + timeoutSeconds * 1000;
    let last = { states: {} };
    for (;;) {
        last = await deps.snapshot();
        const failures = failuresOf(last, selected);
        const notReady = strictNotReady(selected, last.states);
        const unhealthy = [
            ...new Set([...failures.map((failure) => failure.name), ...(notReady ?? [])]),
        ];
        const ready = failures.length === 0 && notReady?.length === 0 && last.readiness?.ready !== false;
        if (ready)
            return outcome("ready", last, selected, failures, unhealthy, timeoutSeconds);
        if (failures.length > 0) {
            return withLogs(outcome("failed", last, selected, failures, unhealthy, timeoutSeconds), deps.fetchLogTails);
        }
        if (last.readiness?.timedOut === true || last.settled === true) {
            return withLogs(outcome("timeout", last, selected, failures, unhealthy.length > 0 ? unhealthy : selected.map((resource) => resource.name), timeoutSeconds), deps.fetchLogTails);
        }
        if (now() >= deadline) {
            return withLogs(outcome("timeout", last, selected, failures, unhealthy.length > 0 ? unhealthy : selected.map((resource) => resource.name), timeoutSeconds), deps.fetchLogTails);
        }
        await sleep(intervalMs);
    }
}
