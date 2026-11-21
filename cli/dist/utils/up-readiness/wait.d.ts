import { type ReadinessResult } from "./evaluate.js";
/**
 * Waits until every non-deferred Tilt resource is built and running. Resolves not-ready as soon as the rest has settled
 * with an errored resource, or after a period of no progress (progress-aware timeout). While builds or image pulls
 * produce output, the wait does not time out. Sablier-deferred resources are excluded: they stay idle by design.
 */
export declare function waitForTiltResourcesReady(port: number, options?: {
    timeoutMs?: number;
    intervalMs?: number;
    fetchJson?: (port: number) => Promise<string | null>;
    fetchLogs?: (port: number, name: string) => Promise<string | null>;
    deferred?: Set<string>;
    /** Resource names that must be present, enabled, and ready (a `--only` selection). */
    expected?: string[];
    /** Called with Tilt's JSON while something has failed: true means nothing left pending can still progress. */
    isStalled?: (jsonText: string) => boolean;
    /** Resource names whose health checks are disabled. */
    disabledHealth?: Set<string>;
    /** How long a runtime-only failure may recover before the wait gives up on it (FLISK_UP_FAILURE_GRACE_MS). */
    failureGraceMs?: number;
    now?: () => number;
    /** Whether a running service's health command cannot run at all (see `healthProbeCannotRun`). Asks Docker unless `fetchJson` is injected. */
    probeCannotRun?: (service: string) => boolean;
}): Promise<ReadinessResult>;
