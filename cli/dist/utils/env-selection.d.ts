import { TdkError } from "./errors.js";
/**
 * The environment variable the engine reads the env file of the run from. The CLI resolves the
 * requested path and exports it, so the engine reads one file for the whole run: the Tilt
 * environment (engine/topologies/tilt/common/utils_env.star) and the Compose interpolation alike.
 */
export declare const PROJECT_ENV_FILE_VAR = "TDK_ENV_FILE";
/**
 * The keys the platform needs in the env file of a run. They are the keys `completeEnvFile` keeps
 * complete in the project `.env`: the Tilt environment, the Postgres password and the JWT secret.
 * A selected file replaces the project `.env` for the run, so it has to carry them too.
 */
export declare const REQUIRED_ENV_FILE_KEYS: readonly string[];
/** Exit code for a rejected `--env-file`: invalid arguments (see docs/reference/machine-readable-cli.md). */
export declare const ENV_FILE_ERROR_EXIT_CODE = 2;
/** Exit code when the project's vendored engine is too old for the option: a blocking finding. */
export declare const ENV_FILE_ENGINE_EXIT_CODE = 1;
/**
 * A rejected `--env-file`. It carries a code so a JSON consumer can tell an unusable file from
 * another failure, and it is a TdkError so the CLI shows it in the house style.
 */
export declare class EnvFileError extends TdkError {
    readonly code: "ENV_FILE_INVALID" | "ENV_FILE_ENGINE_TOO_OLD";
    constructor(code: "ENV_FILE_INVALID" | "ENV_FILE_ENGINE_TOO_OLD", message: string, suggestions?: string[], exitCode?: number);
}
/** The env file of a run, and the values it holds. The values are secrets: never print them. */
export interface SelectedEnvFile {
    /** Absolute path of the selected env file. */
    path: string;
    /** The path relative to the project root, for diagnostics. */
    relativePath: string;
    /** The parsed values. Secrets: never write them to a log, a report or a record. */
    values: Map<string, string>;
}
/** True when the path is inside the project directory. */
export declare function isInsideProject(projectRoot: string, path: string): boolean;
/**
 * Resolves the requested env file to an absolute path inside the project.
 *
 * A relative path is resolved against the current directory, the way `docker compose --env-file`
 * and Node.js' own `--env-file` resolve it. Resolving it the same way keeps the check Node.js does
 * before the CLI starts in step with this one.
 *
 * The file has to live in the project: it is the project env file of the run, and the wake gateway
 * (which mounts the project read-only and runs Compose itself) can only read a file inside it. A
 * path outside the project would also turn the flag into a way to read any file on the machine.
 *
 * @throws TdkError when the path is empty, leaves the project, or does not exist
 */
export declare function resolveEnvFilePath(projectRoot: string, requested: string, options?: {
    baseDir?: string;
}): string;
/**
 * Reads the env file. The values are secrets, so they are only used to configure the run and to
 * mask output; they are never printed.
 *
 * @throws TdkError when the file cannot be read
 */
export declare function readEnvFileValues(path: string): Map<string, string>;
/** The platform keys the file is missing, so the run would start without them. */
export declare function missingRequiredEnvKeys(values: Map<string, string>): string[];
/**
 * Selects the env file of the run and checks that it can carry the run.
 *
 * The selected file replaces the project `.env` for the run, so it has to carry the same keys. Flisk
 * does not complete it: a file the user named may well be committed, and writing a generated
 * credential into it would leak one.
 *
 * @throws TdkError when the file is unusable or misses a key the platform needs
 */
export declare function selectEnvFile(projectRoot: string, requested: string, options?: {
    baseDir?: string;
}): SelectedEnvFile;
/**
 * Points the engine at the selected env file for this run. The engine reads the same variable for
 * the Tilt environment and for the Compose interpolation, so one file drives both.
 */
export declare function applyEnvFileSelection(selection: SelectedEnvFile): void;
/**
 * Refuses the run when the project's vendored engine cannot honour the selection. Without this check
 * the flag would be ignored silently and the run would use the project .env after all.
 *
 * @throws TdkError when the vendored engine is older than this option
 */
export declare function assertEngineSupportsEnvFile(projectRoot: string): void;
/**
 * A warning when the selected env file would break the local database. The Postgres volume keeps the
 * password it was created with, so a different DB_PASSWORD does not change it.
 */
export declare function envFileWarning(projectRoot: string, selection: SelectedEnvFile): string | null;
