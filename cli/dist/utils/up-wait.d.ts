import { type ChildProcess } from "node:child_process";
/** Seconds `flisk up --wait` waits for a healthy stack when `--wait-timeout` is not given. */
export declare const DEFAULT_WAIT_TIMEOUT_SECONDS = 1800;
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
