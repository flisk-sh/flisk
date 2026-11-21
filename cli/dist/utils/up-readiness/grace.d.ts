import type { ReadinessResult } from "./evaluate.js";
/** How long `flisk up` keeps waiting on a container that built but is failing at runtime before it reports a failure. */
export declare const DEFAULT_FAILURE_GRACE_MS = 120000;
/**
 * True while every failure is a runtime one (the container is running; its health check fails) and each of them began
 * less than `graceMs` ago. `failingSince` holds when each resource started failing, so a container that turns unhealthy
 * late gets its own full window instead of inheriting an earlier container's. A database on its first start initialises its data directory and fails its health check
 * for a while: `flisk up` used to print "db failed" and stop waiting, and a few minutes later every container was healthy.
 * A build error never recovers by itself, so it still ends the wait at once.
 */
export declare function withinFailureGrace(result: ReadinessResult, failingSince: ReadonlyMap<string, number>, now: number, graceMs: number): boolean;
/** Records when each currently failing resource started failing and forgets the ones that recovered. */
export declare function trackFailingSince(failingSince: Map<string, number>, failures: ReadinessResult["failures"], now: number): void;
/** FLISK_UP_FAILURE_GRACE_MS when it is a finite, non-negative number; otherwise the default. */
export declare function failureGraceFromEnv(value: string | undefined): number;
