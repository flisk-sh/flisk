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
/** The most of a failure message `flisk up` prints for one resource. */
export declare const MAX_FAILURE_MESSAGE = 300;
/**
 * Failures whose message carries no reason, given the reason their command logged instead. The health gates
 * (`postgres-healthy`, `<svc>-healthy`, `<job>-done`) print the cause as their last `ERROR: ...` line, such as a container
 * that exited or a health check that kept failing past its recovery window, so `flisk up` shows that rather than
 * "exit status 1" (#3210). A failed command or compose step (`init-networks`, `docker compose up`) is shown as the last
 * lines of its log, where Docker's own message is, rather than the command line. A reason taken from a log is stripped
 * of terminal escapes and cut to MAX_FAILURE_MESSAGE characters. Other failures, and those whose log has nothing to
 * show, are returned unchanged, with the command text cut to MAX_FAILURE_MESSAGE characters. Only the first five
 * failures have their log read; the command text of the rest is cut the same way.
 */
export declare function withLoggedReasons<T extends {
    name: string;
    message: string;
}>(failures: T[], fetchLogs: (name: string) => Promise<string | null>): Promise<T[]>;
/**
 * Failures with the reason their log gives (withLoggedReasons) and, when that reason names a known machine problem,
 * its fix, for both the `flisk up --json` result and its error message.
 */
export declare function explainFailures<T extends {
    name: string;
    message: string;
}>(failures: T[], fetchLogs: (name: string) => Promise<string | null>): Promise<Array<T & {
    fix?: string;
}>>;
/** The last lines of a log that have text, joined on one line, keeping the end when it is too long. */
export declare function logTail(log: string, lines?: number): string | null;
/**
 * The failure lines `flisk up --wait` prints from the `flisk up --json` result: each failed resource and its reason,
 * and under it the fix when the reason names a known machine problem.
 */
export declare function formatWaitFailures(failures: Array<{
    name: string;
    reason?: string;
    message?: string;
    fix?: string;
    logs?: string[];
}>): string[];
/** "last line" or "last 3 lines". */
export declare function lastLines(count: number): string;
/**
 * The last `ERROR: ...` line of a resource log, without that prefix, or null. Tilt may put the resource name and a
 * separator before each line, so the marker can come after other text.
 */
export declare function loggedErrorLine(log: string): string | null;
/** A plain fix for a failure message that names a known machine problem, or null. */
export declare function machineProblemFix(message: string): string | null;
export declare function transitiveDependencies(name: string, dependsOn: Record<string, string[]>): Set<string>;
/**
 * Shared resources every service needs. When one of them fails, nothing still pending can become ready, so the wait
 * ends at the next poll instead of when the last unrelated image build finishes (#4125). An image build is a Tilt
 * resource of its own with no dependencies, so the dependency graph alone never links it to a failed postgres.
 */
export declare const SHARED_INFRASTRUCTURE: string[];
export declare function buildStartupReport(jsonText: string, dependsOn: Record<string, string[]>, deferred?: Set<string>): StartupReport;
/** A failure exists and everything still pending is blocked by it, so waiting longer cannot help. */
export declare function isStartupStalled(jsonText: string, dependsOn: Record<string, string[]>, deferred?: Set<string>): boolean;
export declare function formatStartupReport(report: StartupReport, timedOut: boolean, occupantOf?: (port: number) => PortOccupant | null, machineFixes?: Map<string, string>, lastLogs?: Record<string, string>): string[];
