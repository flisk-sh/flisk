import type { DiscoveredResource } from "../types/index.js";
import type { JsonEmitter } from "./json-output.js";
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
 * Env entries that override the project .env for a local service. The .env can still hold the Docker host's
 * DATABASE_URL; a service with no database in dependsOn must read it as empty, or its /health check pings a host
 * that does not exist and never goes healthy (#4456). A service that does depend on the database keeps the value.
 */
export declare function localDatabaseEnv(dependsOn: readonly string[], databaseNames?: readonly string[]): Record<string, string>;
/**
 * `flisk up` for a selection where every service declares `command`: no Docker, no Compose, no Tilt and no generated files.
 * Resolves only when the run ends (Ctrl+C, `flisk down`, or a failed start, which exits 1).
 */
export declare function runNativeUp(input: NativeUpInput): Promise<void>;
