// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/** How long `flisk up` keeps waiting on a container that built but is failing at runtime before it reports a failure. */
export const DEFAULT_FAILURE_GRACE_MS = 120_000;
/**
 * True while every failure is a runtime one (the container is running; its health check fails) and each of them began
 * less than `graceMs` ago. `failingSince` holds when each resource started failing, so a container that turns unhealthy
 * late gets its own full window instead of inheriting an earlier container's. A database on its first start initialises its data directory and fails its health check
 * for a while: `flisk up` used to print "db failed" and stop waiting, and a few minutes later every container was healthy.
 * A build error never recovers by itself, so it still ends the wait at once.
 */
export function withinFailureGrace(result, failingSince, now, graceMs) {
    if (result.failures.length === 0)
        return false;
    return result.failures.every((failure) => {
        const since = failingSince.get(failure.name);
        return failure.runtime === true && since !== undefined && now - since < graceMs;
    });
}
/** Records when each currently failing resource started failing and forgets the ones that recovered. */
export function trackFailingSince(failingSince, failures, now) {
    const current = new Set(failures.map((failure) => failure.name));
    for (const name of [...failingSince.keys()]) {
        if (!current.has(name))
            failingSince.delete(name);
    }
    for (const name of current) {
        if (!failingSince.has(name))
            failingSince.set(name, now);
    }
}
/** FLISK_UP_FAILURE_GRACE_MS when it is a finite, non-negative number; otherwise the default. */
export function failureGraceFromEnv(value) {
    const parsed = value === undefined || value.trim() === "" ? Number.NaN : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_FAILURE_GRACE_MS;
}
