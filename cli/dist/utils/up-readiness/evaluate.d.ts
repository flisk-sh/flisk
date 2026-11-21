import type { DiscoveredResource } from "../../types/index.js";
export interface ReadinessResult {
    ready: boolean;
    /** `runtime` is true when the container is still running but its health check fails (it may still recover). */
    failures: Array<{
        name: string;
        message: string;
        runtime?: boolean;
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
/**
 * Tilt lists resources outside the current focus (the other release phases, or everything but a `--only` selection) with
 * `disableStatus.state: Disabled` and both statuses `none`, which would read as pending forever. A resource whose update
 * status is `not_applicable` (a serve-only local resource) has nothing to build, so it counts as built.
 * When health checks are disabled for a resource (`disabledHealth`), its container health check status is stripped so
 * running containers are considered ready immediately. The same goes for a container Docker reports unhealthy when
 * `probeCannotRun` says its health command cannot run at all (see `healthProbeCannotRun`).
 */
export declare function onlyEnabledResources(jsonText: string, disabledHealth?: Set<string>, probeCannotRun?: (service: string) => boolean): string;
/**
 * True when the container of a Compose service is running and every health probe Docker recorded never ran its command (see
 * `probeNeverRan`), such as `curl` in an image without curl, as in LycheeOrg/Lychee's facial-recognition sidecar. Such a probe
 * says nothing about the app, so it must not fail `flisk up`. Docker keeps only the last five probes: for a shell-form probe
 * the whole failing streak must be inside that log, because an older real failure may have scrolled out of it. A probe that runs
 * and fails is a real failure. More than one container with the service name, or Docker not answering, is "no", never "yes".
 */
export declare function healthProbeCannotRun(service: string): boolean;
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
export declare function evaluateTiltReadiness(jsonText: string, deferred: Set<string>, expected?: string[], disabledHealth?: Set<string>, probeCannotRun?: (service: string) => boolean): {
    result: ReadinessResult;
    settled: boolean;
};
export declare function findBuildingResourceNames(jsonText: string, deferred?: Set<string>): string[];
export declare function findPendingResourceNames(jsonText: string, deferred?: Set<string>): string[];
