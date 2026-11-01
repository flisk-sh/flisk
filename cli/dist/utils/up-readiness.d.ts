import type { DiscoveredResource } from "../types/index.js";
import { findStaleDisabledResources } from "./doctor-runtime.js";
export { findStaleDisabledResources };
export interface ReadinessResult {
    ready: boolean;
    failures: Array<{
        name: string;
        message: string;
    }>;
    pending: number;
    timedOut: boolean;
    /** Names of the resources Tilt has enabled (everything not `Disabled`), so callers report what actually started. */
    enabled: string[];
    /** Names of services that were still building when the timeout occurred. */
    stillBuilding?: string[];
    /** Last log lines of services that timed out before becoming ready. */
    lastLogs?: Record<string, string>;
}
export declare function tiltGetUiResources(port: number): Promise<string | null>;
export declare function tiltResourceLogs(port: number, name: string): Promise<string | null>;
/**
 * Tilt lists resources outside the current focus (the other release phases, or everything but a `--only` selection) with
 * `disableStatus.state: Disabled` and both statuses `none`, which would read as pending forever. A resource whose update
 * status is `not_applicable` (a serve-only local resource) has nothing to build, so it counts as built.
 * When health checks are disabled for a resource (`disabledHealth`), its container health check status is stripped so
 * running containers are considered ready immediately.
 */
export declare function onlyEnabledResources(jsonText: string, disabledHealth?: Set<string>): string;
export declare function getDisabledHealthResourceNames(resources?: DiscoveredResource[]): Set<string>;
/**
 * Services the caller asked for must not vanish into the disabled filter: one that Tilt lists as disabled (it can be
 * disabled while running) is a failure, and one Tilt does not list yet is still pending.
 */
export declare function checkExpectedResources(jsonText: string, expected: string[]): {
    missing: string[];
    disabled: string[];
};
/** Resources that report on the stack without gating it. */
export declare function isAdvisoryResource(name: string): boolean;
/**
 * One look at `tilt get uiresources -o json`. `settled` means polling can stop: everything is ready, or the rest has
 * finished with a failure (an errored resource, or an expected service Tilt has disabled).
 */
export declare function evaluateTiltReadiness(jsonText: string, deferred: Set<string>, expected?: string[], disabledHealth?: Set<string>): {
    result: ReadinessResult;
    settled: boolean;
};
export declare function findBuildingResourceNames(jsonText: string, deferred?: Set<string>): string[];
export declare function findPendingResourceNames(jsonText: string, deferred?: Set<string>): string[];
export declare function formatTail(text: string, maxLines?: number): string;
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
    now?: () => number;
}): Promise<ReadinessResult>;
