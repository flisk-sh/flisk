import type { ExecAsync } from "./exec-async.js";
/** Results of host commands for one `flisk doctor` run, keyed by command string and options. */
export type HostCommandCache = Map<string, {
    output: string;
} | {
    error: unknown;
}>;
/** Create the cache once per doctor run and pass it to the checks; never keep it at module level. */
export declare function createHostCommandCache(): HostCommandCache;
/** Promises of async host commands for one `flisk doctor` run, keyed by command and timeout. */
export type AsyncCommandCache = Map<string, Promise<string>>;
/** Create the cache once per doctor run and pass it to `cacheExecAsync`; never keep it at module level. */
export declare function createAsyncCommandCache(): AsyncCommandCache;
/**
 * Wrap an ExecAsync so each command and timeout runs once. The promise is stored, so a caller that
 * arrives while the command is still running joins it, and a rejected promise reaches every caller.
 */
export declare function cacheExecAsync(exec: ExecAsync, cache: AsyncCommandCache): ExecAsync;
/**
 * The one `docker ps` that the port plan and the ingress check share. The cache key includes the
 * timeout, so both callers must use this exact command and timeout to hit the same entry.
 */
export declare const SHARED_DOCKER_PS: {
    readonly args: readonly ["ps", "--format", "{{.Names}}\\t{{.Image}}\\t{{.Ports}}"];
    readonly shellCommand: "docker ps --format '{{.Names}}\\t{{.Image}}\\t{{.Ports}}'";
    readonly timeoutMs: 10000;
};
/**
 * Run `run` once per key. Later callers get the stored output, or the stored error rethrown.
 * Without a cache it just runs.
 */
export declare function runCachedHostCommand(cache: HostCommandCache | undefined, shellCommand: string, options: {
    encoding: string;
    timeout: number;
}, run: () => string): string;
