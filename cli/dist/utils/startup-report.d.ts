import type { PortOccupant } from "../types/index.js";
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
    /** Services whose images were still actively building when timed out. */
    stillBuilding?: string[];
    /** Last log lines for services that timed out. */
    lastLogs?: Record<string, string>;
}
/**
 * Tilt's error for a failed local command is only "exit status 1"; the reason (for example Docker's "all predefined
 * address pools have been fully subnetted") is in the resource's log. Returns the fix for each failed resource whose
 * message or log names a known machine problem.
 */
export declare function machineProblemFixes(failures: Array<{
    name: string;
    message: string;
}>, fetchLogs: (name: string) => Promise<string | null>): Promise<Map<string, string>>;
/** A plain fix for a failure message that names a known machine problem, or null. */
export declare function machineProblemFix(message: string): string | null;
export declare function transitiveDependencies(name: string, dependsOn: Record<string, string[]>): Set<string>;
export declare function buildStartupReport(jsonText: string, dependsOn: Record<string, string[]>, deferred?: Set<string>): StartupReport;
/** A failure exists and everything still pending is blocked by it, so waiting longer cannot help. */
export declare function isStartupStalled(jsonText: string, dependsOn: Record<string, string[]>, deferred?: Set<string>): boolean;
export declare function formatStartupReport(report: StartupReport, timedOut: boolean, occupantOf?: (port: number) => PortOccupant | null, machineFixes?: Map<string, string>, lastLogs?: Record<string, string>): string[];
