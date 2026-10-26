import type { PortOccupant } from "./port-occupant.js";
export interface StartupReport {
    failed: Array<{
        name: string;
        message: string;
    }>;
    /**
     * Depending, directly or through other services, on something that failed. Such a service is not ready even when its
     * own container runs: Tilt starts dependents once a dependency's container runs, before its health check passes.
     */
    blocked: Array<{
        name: string;
        because: string[];
    }>;
    /** Not ready with nothing failed upstream: still building or starting. */
    starting: string[];
}
export declare function transitiveDependencies(name: string, dependsOn: Record<string, string[]>): Set<string>;
export declare function buildStartupReport(jsonText: string, dependsOn: Record<string, string[]>, deferred?: Set<string>): StartupReport;
/** A failure exists and everything still pending is blocked by it, so waiting longer cannot help. */
export declare function isStartupStalled(jsonText: string, dependsOn: Record<string, string[]>, deferred?: Set<string>): boolean;
export declare function formatStartupReport(report: StartupReport, timedOut: boolean, occupantOf?: (port: number) => PortOccupant | null): string[];
