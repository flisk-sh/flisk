import type { CheckResult, DiscoveredResource } from "../types/index.js";
/**
 * Doctor checks for a project whose services all declare `command` (#2231). Such a project runs as local processes, so doctor
 * checks what those processes need (their programs, their dependsOn, their ports) instead of Docker, Compose and Tilt.
 */
/** Says which runtime doctor checked, so a missing Docker check reads as intended and not as forgotten. */
export declare function checkNativeRuntime(resources: readonly DiscoveredResource[], dockerRunning?: () => boolean): CheckResult;
/** Each service's command starts a program that is installed. */
export declare function checkNativeCommands(resources: readonly DiscoveredResource[], find?: (program: string) => string | null): CheckResult;
/** A dependsOn name must be another service of the project: local processes cannot start a database or gateway for it. */
export declare function checkNativeDependsOn(resources: readonly DiscoveredResource[]): CheckResult;
/**
 * When a native run is up, each service answers on its health URL (or accepts connections on its port). Skipped when nothing
 * runs: doctor is also used before the first `flisk up`.
 */
export declare function checkNativeServiceHealth(projectRoot: string, resources: readonly DiscoveredResource[], timeoutMs: number): Promise<CheckResult>;
