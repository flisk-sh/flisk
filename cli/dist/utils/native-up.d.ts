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
}
/** Variables `${VAR}` in a service's env may reference: the env file of the run, overridden by the shell. */
/** What a local process starts with: the project .env (or --env-file), overridden by the shell. */
export declare function runVariables(projectRoot: string, envFilePath?: string): Record<string, string>;
/**
 * `flisk up` for a selection where every service declares `command`: no Docker, no Compose, no Tilt and no generated files.
 * Resolves only when the run ends (Ctrl+C, `flisk down`, or a failed start, which exits 1).
 */
export declare function runNativeUp(input: NativeUpInput): Promise<void>;
