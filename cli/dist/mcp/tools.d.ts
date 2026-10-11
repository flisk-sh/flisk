import { type ChildProcess } from "node:child_process";
import type { McpTool, McpToolResult } from "./server.js";
export type RunTdk = (args: string[], options?: {
    timeoutMs?: number;
    cwd?: string;
}) => Promise<TdkRun>;
export interface TdkRun {
    exitCode: number | null;
    stdout: string;
    stderr: string;
}
/**
 * How to run this CLI again: `node <script>` / `bun <script>` when started from a script, or the executable alone when it is
 * a `bun build --compile` binary, whose argv[1] is a virtual path that exists only inside the binary.
 */
export declare function cliInvocation(execPath?: string, script?: string | undefined, fileExists?: (path: string) => boolean): string[];
/** Runs this same CLI (`tdk <args>`) so every tool behaves exactly like its command. */
export declare const runTdkCli: RunTdk;
/** Turn a command's `--json` stdout into a tool result. A parseable envelope with errors, or `ok: false`, is an error result. */
export declare function toToolResult(run: TdkRun): McpToolResult;
export interface UpDeps {
    /** Starts `tdk up` detached, with output going to a log file. */
    spawnUp: (args: string[], logFile: string, cwd?: string) => ChildProcess;
    readLog: (logFile: string) => string;
    sleep: (ms: number) => Promise<void>;
    now: () => number;
    logFile: () => string;
}
export declare const defaultUpDeps: UpDeps;
export declare function buildUpArgs(args: Record<string, unknown>): string[];
/**
 * Starts the stack detached and returns without waiting for it to be ready (a build can take minutes, longer than a tool
 * call may last). It watches only for an early result, which is how a refusal such as UNKNOWN_SERVICE, TILT_ALREADY_RUNNING
 * or an unsupported host arrives; otherwise the caller polls the `status` tool for `data.tilt.readiness`.
 */
export declare function startUp(args: Record<string, unknown>, deps?: UpDeps): Promise<McpToolResult>;
export declare function buildLogsArgs(args: Record<string, unknown>): string[];
export declare function createTdkTools(run?: RunTdk, up?: UpDeps): McpTool[];
