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
}
export declare function tiltGetUiResources(port: number): Promise<string | null>;
/**
 * Tilt lists resources outside the current focus (the other release phases, or everything but a `--only` selection) with
 * `disableStatus.state: Disabled` and both statuses `none`, which would read as pending forever. A resource whose update
 * status is `not_applicable` (a serve-only local resource) has nothing to build, so it counts as built.
 */
export declare function onlyEnabledResources(jsonText: string): string;
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
export declare function evaluateTiltReadiness(jsonText: string, deferred: Set<string>, expected?: string[]): {
    result: ReadinessResult;
    settled: boolean;
};
/**
 * Waits until every non-deferred Tilt resource is built and running. Resolves not-ready as soon as the rest has settled
 * with an errored resource, or at the deadline. Sablier-deferred resources are excluded: they stay idle by design.
 */
export declare function waitForTiltResourcesReady(port: number, options?: {
    timeoutMs?: number;
    intervalMs?: number;
    fetchJson?: (port: number) => Promise<string | null>;
    deferred?: Set<string>;
    /** Resource names that must be present, enabled, and ready (a `--only` selection). */
    expected?: string[];
    /** Called with Tilt's JSON while something has failed: true means nothing left pending can still progress. */
    isStalled?: (jsonText: string) => boolean;
}): Promise<ReadinessResult>;
