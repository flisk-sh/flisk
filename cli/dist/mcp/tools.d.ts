import { type ChildProcess } from "node:child_process";
import type { McpTool, McpToolResult } from "./server.js";
export type RunFlisk = (args: string[], options?: {
    timeoutMs?: number;
    cwd?: string;
}) => Promise<FliskRun>;
export interface FliskRun {
    exitCode: number | null;
    stdout: string;
    stderr: string;
}
/**
 * How to run this CLI again: `node <script>` / `bun <script>` when started from a script, or the executable alone when it is
 * a `bun build --compile` binary, whose argv[1] is a virtual path that exists only inside the binary.
 */
export declare function cliInvocation(execPath?: string, script?: string | undefined, fileExists?: (path: string) => boolean): string[];
/** Runs this same CLI (`flisk <args>`) so every tool behaves exactly like its command. */
export declare const runFliskCli: RunFlisk;
/**
 * Turn a command's `--json` stdout into a tool result. A parseable envelope with errors, or `ok: false` (in `data`, or at
 * the top level for `runtime --check-assets --json`, which prints no envelope), is an error result.
 */
export declare function toToolResult(run: FliskRun): McpToolResult;
/**
 * Turn the output of a command that has no `--json` (the scaffolding commands) into a tool result: its text output, and an
 * error result when it exits non-zero. Failures are printed to stderr, so it is returned too.
 */
export declare function toTextResult(run: FliskRun): McpToolResult;
export interface UpDeps {
    /** Starts `flisk up` detached, with output going to a log file. */
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
/** `flisk resource <name> ... --yes`: options as `--flag=value`, after the name, so a variadic `--feature` never takes it. */
export declare function buildResourceCreateArgs(args: Record<string, unknown>): string[];
/** `flisk stack <stack> --resources=<name>... --yes`: one `--resources=` per name so a value is never a flag. */
export declare function buildStackAssignArgs(args: Record<string, unknown>): string[];
/** `flisk project [template] --yes`. Never `--force`, which overwrites an existing .flisk/project.json. */
export declare function buildProjectInitArgs(args: Record<string, unknown>): string[];
/**
 * `flisk config regenerate`, a dry run unless `dryRun` is explicitly false: a real run rewrites the generated master files
 * from .flisk/project.json and discards any hand edits in them.
 */
export declare function buildConfigRegenerateArgs(args: Record<string, unknown>): string[];
/**
 * `flisk eject --json`. A real run writes EJECTED.md into the project, so it is refused unless `confirm` is true; a dry run
 * changes nothing and needs no confirmation.
 */
export declare function buildProjectEjectArgs(args: Record<string, unknown>): string[];
/** `flisk import [dir] --json`, which writes without a prompt unless `dryRun` is set. `dir` comes before the flags. */
export declare function buildProjectImportArgs(args: Record<string, unknown>): string[];
export declare function createFliskTools(run?: RunFlisk, up?: UpDeps): McpTool[];
