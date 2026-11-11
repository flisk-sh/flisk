import { type ChildProcess } from "node:child_process";
/** Seconds `flisk up --wait` waits for a healthy stack when `--wait-timeout` is not given. */
export declare const DEFAULT_WAIT_TIMEOUT_SECONDS = 1800;
/** Lines of each unhealthy service's log a failed `flisk up --wait` prints, and the most it prints in all. */
export declare const UNHEALTHY_LINES_PER_SERVICE = 5;
export declare const UNHEALTHY_LINES_TOTAL = 20;
/** The last log lines of one service that was not healthy when `flisk up --wait` gave up. */
export interface UnhealthyLogTail {
    name: string;
    lines: string[];
}
/**
 * The lines `flisk logs --unhealthy --json` returned, grouped by service in the order they first appear: the last
 * `perService` lines of each, and no more than `total` lines over all of them (a service past that keeps its name with
 * no lines, so it is still named).
 */
export declare function unhealthyLogTails(lines: Array<{
    resource: string | null;
    text: string;
}>, perService?: number, total?: number): UnhealthyLogTail[];
/** The human lines for those tails, under the failure message: each service, its lines, and how to see more. */
export declare function formatUnhealthyLogTails(tails: UnhealthyLogTail[]): string[];
/**
 * Runs `flisk logs --unhealthy --json` the same way `flisk up --wait` runs `flisk up`, so the lookup (Tilt or local
 * processes, and secret redaction) is the one `flisk logs` does. Resolves to null when it cannot run or says nothing.
 */
export declare function fetchUnhealthyLogLines(invocation: () => string[], cwd?: string, timeoutMs?: number): Promise<Array<{
    resource: string | null;
    text: string;
}> | null>;
/**
 * The `flisk up --json` result with each failure that names an unhealthy service given its log lines as `logs`, and
 * any other unhealthy service added as a failure of its own.
 */
export declare function withUnhealthyLogs(failures: Array<{
    name: string;
    [key: string]: unknown;
}>, tails: UnhealthyLogTail[]): Array<{
    name: string;
    [key: string]: unknown;
}>;
export interface UpWaitDeps {
    /** Starts `flisk up` detached with its output going to a log file. */
    spawnUp: (args: string[], logFile: string, cwd?: string) => ChildProcess;
    readLog: (logFile: string) => string;
    sleep: (ms: number) => Promise<void>;
    now: () => number;
    logFile: () => string;
}
export type UpWaitOutcome = {
    kind: "ready";
    json: string;
} | {
    kind: "failed";
    json: string;
} | {
    kind: "exited";
    exitCode: number | null;
    logTail: string;
} | {
    kind: "timeout";
    logTail: string;
    logFile: string;
} | {
    kind: "spawn-error";
    message: string;
};
/** The arguments of the detached child: the caller's own, without the wait options, asking for one JSON result. */
export declare function detachedUpArgs(argv: string[]): string[];
/** Parses `--wait-timeout`: a whole number of seconds from 1 to 21600 (6 hours), or the default when omitted. */
export declare function parseWaitTimeout(value: unknown): {
    ok: true;
    seconds: number;
} | {
    ok: false;
    message: string;
};
/**
 * Starts the stack detached and waits for the JSON result `flisk up --json` prints when the stack is ready or the
 * command fails. The stack keeps running afterwards, also on a timeout (`flisk down` stops it).
 */
export declare function upAndWait(argv: string[], timeoutSeconds: number, deps: UpWaitDeps, cwd?: string): Promise<UpWaitOutcome>;
export declare const defaultUpWaitDeps: (invocation: () => string[]) => UpWaitDeps;
