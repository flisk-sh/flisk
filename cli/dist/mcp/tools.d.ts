import { type ChildProcess } from "node:child_process";
import type { McpTool, McpToolResult } from "./server.js";
/**
 * The CLI command behind each MCP tool (#4258). Kept in one table so tools/list can name the exact
 * equivalent and a test fails when a tool is added without one. Placeholders are literal in the
 * advertised description so a model can see which arguments it maps to.
 */
export declare const MCP_CLI_EQUIVALENTS: Readonly<Record<string, string>>;
export type RunFlisk = (args: string[], options?: {
    timeoutMs?: number;
    cwd?: string;
}) => Promise<FliskRun>;
export interface FliskRun {
    exitCode: number | null;
    stdout: string;
    stderr: string;
}
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
/** What the supervising `flisk up` has on record while it is still starting the local processes of a project. */
export interface NativeUpSnapshot {
    services: Record<string, {
        status: "ready" | "pending" | "error" | "unknown";
        reason?: string;
    }>;
    /** The last lines (own output, secrets masked) of each service that is not ready. */
    logs: Record<string, string[]>;
}
export declare function readNativeUpSnapshot(projectDir: string, since: number): NativeUpSnapshot | null;
/**
 * The state of a start, in one word. `starting`: launched, readiness not confirmed yet. `ready`: every local process passed its
 * readiness check. `failed`: a process exited or gave up, or `flisk up` ended. `timeout`: readiness was not established within
 * the wait the caller asked for with waitForReady (the stack keeps starting).
 */
export type UpState = "starting" | "ready" | "failed" | "timeout";
export interface UpDeps {
    /** Starts `flisk up` detached, with output going to a log file. */
    spawnUp: (args: string[], logFile: string, cwd?: string) => ChildProcess;
    readLog: (logFile: string) => string;
    /** What the supervising `flisk up` has on record for the local processes of the project at this path (native runs only). */
    nativeSnapshot?: (projectDir: string, since: number) => NativeUpSnapshot | null;
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
/**
 * `flisk status --json --unhealthy` still lists every service (the flag only shortens the text output, and the envelope
 * carries the names in `data.unhealthy`). For an agent that wants the broken services only, drop the others from
 * `data.resources` and from each stack's `resources`, and say so in `data.filteredTo`. Counts keep describing the whole project.
 */
export declare function trimStatusToUnhealthy(result: McpToolResult): McpToolResult;
/** `flisk status --json`, narrowed by `unhealthy` and `stack` the way the CLI does. */
export declare function buildStatusArgs(args: Record<string, unknown>): string[];
export declare function buildLogsArgs(args: Record<string, unknown>): string[];
/** `flisk resource <name> ... --yes`: options as `--flag=value`, after the name, so a variadic `--feature` never takes it. */
/** `flisk tool add <tool> [name] --json` for the tool_add tool; the tool must be one the catalog knows. */
export declare function buildToolAddArgs(args: Record<string, unknown>): string[];
export declare function buildResourceCreateArgs(args: Record<string, unknown>): string[];
/** `flisk stack <stack> --resources=<name>... --json`: one `--resources=` per name so a value is never a flag. */
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
/**
 * `flisk import [dir] --json`, which writes without a prompt unless `dryRun` is set. `dir` comes before the flags. `force`
 * overwrites an existing service.json, so a real run with it is refused unless `confirm` is true (a dry run changes nothing).
 */
export declare function buildProjectImportArgs(args: Record<string, unknown>): string[];
export declare function createFliskTools(run?: RunFlisk, up?: UpDeps): McpTool[];
