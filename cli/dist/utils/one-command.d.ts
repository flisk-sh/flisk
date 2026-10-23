import { spawn } from "node:child_process";
/** Picks the first frontend URL out of the `flisk up` output, if it printed one. */
export declare function findFrontendUrl(output: string): string | undefined;
export type StackOutcome = {
    /** True when the stack came up and its services are healthy. */
    ok: boolean;
    /** The machine envelope the stack printed, with the Tilt UI url and the services. */
    data?: Record<string, unknown>;
    /** The message from the stack when it did not come up. */
    error?: string;
    /** Everything the stack printed, kept for the failure message. */
    raw: string;
};
export type SetupOutcome = {
    /** True when the project was initialized. */
    ok: boolean;
    /** The last line the setup printed, kept for the failure message. */
    error?: string;
    /** Everything the setup printed, kept for `--verbose` and the log file. */
    output?: string;
};
/**
 * Initializes a cloned project.
 *
 * A starter repository holds services and a Tiltfile, but no project configuration, and
 * `flisk up` refuses to run without one. So the one-command flow initializes the folder it
 * just cloned before it starts the stack.
 *
 * Nothing is inherited: a child that writes straight to the terminal corrupts the frame the
 * caller is painting. Both streams are captured, and `--quiet` keeps the setup from printing
 * its full configuration report at all.
 */
export declare function initializeProject(binPath: string, cwd: string, env?: NodeJS.ProcessEnv, spawnFn?: typeof spawn): Promise<SetupOutcome>;
/** Reads the `{schemaVersion, data, errors}` envelope `flisk up --json` prints when it is done. */
export declare function parseStackEnvelope(output: string): StackOutcome | undefined;
/**
 * Starts the stack quietly and reports when it is ready.
 *
 * `flisk up --json` prints one JSON object when the stack is up (or has failed) and keeps
 * Tilt's own build logs out of the way, so the caller can show a progress line instead of
 * thousands of Docker and Traefik lines. The stack keeps running in the background.
 */
export declare function runStackQuiet(binPath: string, cwd: string, env?: NodeJS.ProcessEnv, spawnFn?: typeof spawn): Promise<StackOutcome>;
/**
 * A free directory for the project. A second demo in the same folder gets its own directory
 * (`name-2`, `name-3`, ...) instead of failing because the first one is still there.
 */
export declare function nextAvailableProjectDir(base: string, isTaken: (candidate: string) => boolean): string;
/** The service folders of a project that have their own package.json. */
export declare function findServiceDirs(projectRoot: string, maxDepth?: number): string[];
/**
 * Installs the host dependencies of the services. The stack typechecks the services on the
 * host, so a fresh clone needs its dependencies before it can come up.
 */
export declare function installServiceDependencies(projectRoot: string, run?: (command: string, args: string[], cwd: string) => Promise<number>): Promise<{
    dir: string;
    ok: boolean;
}[]>;
