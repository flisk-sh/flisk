import type { DiscoveredResource } from "../types/index.js";
import type { JsonEmitter } from "./json-output.js";
import { type NativeServicePlan } from "./native-runtime.js";
export interface NativeFailure {
    name: string;
    reason: string;
    logs?: string[];
}
/** Per-URL readiness entries for `flisk up --json` in a local-process run, matching the container `data.urls` shape. */
export declare function nativeUrlChecks(services: readonly Pick<NativeServicePlan, "name" | "url">[], statuses?: ReadonlyMap<string, number>): Array<{
    service: string;
    url: string;
    didAnswer: boolean;
    status: number;
}>;
/**
 * Each failure with the last lines its service wrote (`logs`). The reason alone ("kept exiting; see its output above")
 * points at output that a `--json` or MCP caller never saw, so the cause (a missing variable, a stack trace) travels with
 * the failure. Lines come from `.flisk/native/logs`, which the supervisor masked when it wrote them; a service that
 * wrote nothing, or was never started, keeps its failure as it was. With `sinceEpochMs`, lines from earlier runs (the logs
 * are appended to) are left out.
 */
export declare function withFailureLogs(projectRoot: string, failures: NativeFailure[], sinceEpochMs?: number): NativeFailure[];
export interface NativeUpInput {
    projectRoot: string;
    /** The services to start (the selection plus its dependsOn closure); every one declares `command`. */
    selected: DiscoveredResource[];
    /** Names in `selected` that are only there because a requested service depends on them. */
    dependencies: string[];
    stackName?: string;
    only?: string[];
    /** The env file of the run (`--env-file`), else the project .env when it exists. */
    envFilePath?: string;
    dryRun?: boolean;
    quiet?: boolean;
    force?: boolean;
    emit?: JsonEmitter;
    /** Overrides for tests. */
    readyTimeoutMs?: number;
    exit?: (code: number) => never;
    /** Inferred from package.json (plain Node repo). */
    inferred?: {
        command: string;
        script: string;
    };
}
/** Variables `${VAR}` in a service's env may reference: the env file of the run, overridden by the shell. */
/** What a local process starts with: the project .env (or --env-file), overridden by the shell. */
export declare function runVariables(projectRoot: string, envFilePath?: string): Record<string, string>;
/**
 * Names (never values) of variables the .env sets that the shell overrides with a different value. A restart
 * re-reads the .env but the shell of the running `flisk up` still wins, so an edit to these has no effect.
 */
export declare function shadowedEnvKeys(projectRoot: string, envFilePath?: string, shell?: NodeJS.ProcessEnv): string[];
/**
 * Env entries that override the project .env for a local service. The .env can still hold the Docker host's
 * DATABASE_URL; a service with no database in dependsOn must read it as empty, or its /health check pings a host
 * that does not exist and never goes healthy (#4456). A service that does depend on the database keeps the value.
 */
export declare function localDatabaseEnv(dependsOn: readonly string[], databaseNames?: readonly string[], declaredEnv?: Readonly<Record<string, string>>): Record<string, string>;
/** A problem `flisk up` can detect before starting anything, in both a real run and a dry run. */
export interface UpPreflightProblem {
    code: string;
    message: string;
    suggestions?: string[];
}
/**
 * The static preflight shared by `flisk up` and `flisk up --dry-run`: an invalid plan (including two services on one
 * port), a binding toolchain mismatch and a command whose program is not installed. Everything here only reads, so a
 * dry run reports these problems with `ok: false` and exits 1 instead of printing a plan a real run would refuse.
 */
export declare function nativeUpPreflight(selected: readonly DiscoveredResource[], plan: {
    services: readonly NativeServicePlan[];
    errors: string[];
}): UpPreflightProblem[];
/**
 * The host-port half of the same preflight. A real run calls it only after an already-running stack has been reported,
 * since that stack legitimately holds its own ports; a dry run calls it before printing its plan.
 */
export declare function nativeUpPortPreflight(services: readonly NativeServicePlan[]): Promise<UpPreflightProblem[]>;
/**
 * `flisk up` for a selection where every service declares `command`: no Docker, no Compose, no Tilt and no generated files.
 * Resolves only when the run ends (Ctrl+C, `flisk down`, or a failed start, which exits 1).
 */
export declare function runNativeUp(input: NativeUpInput): Promise<void>;
