// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { COMPLETED_ENV_VARS, parseEnv } from "./env-validator.js";
import { TdkError } from "./errors.js";

/**
 * The environment variable the engine reads the env file of the run from. The CLI resolves the
 * requested path and exports it, so the engine reads one file for the whole run: the Tilt
 * environment (engine/topologies/tilt/common/utils_env.star) and the Compose interpolation alike.
 */
export const PROJECT_ENV_FILE_VAR = "TDK_ENV_FILE";

/**
 * The keys the platform needs in the env file of a run. They are the keys `completeEnvFile` keeps
 * complete in the project `.env`: the Tilt environment, the Postgres password and the JWT secret.
 * A selected file replaces the project `.env` for the run, so it has to carry them too.
 */
export const REQUIRED_ENV_FILE_KEYS: readonly string[] = COMPLETED_ENV_VARS;

/** Exit code for a rejected `--env-file`: invalid arguments (see docs/reference/machine-readable-cli.md). */
export const ENV_FILE_ERROR_EXIT_CODE = 2;

/** Exit code when the project's vendored engine is too old for the option: a blocking finding. */
export const ENV_FILE_ENGINE_EXIT_CODE = 1;

/**
 * A rejected `--env-file`. It carries a code so a JSON consumer can tell an unusable file from
 * another failure, and it is a TdkError so the CLI shows it in the house style.
 */
export class EnvFileError extends TdkError {
  constructor(
    readonly code: "ENV_FILE_INVALID" | "ENV_FILE_ENGINE_TOO_OLD",
    message: string,
    suggestions: string[] = [],
    exitCode: number = ENV_FILE_ERROR_EXIT_CODE,
  ) {
    super(message, suggestions, exitCode);
    this.name = "EnvFileError";
  }
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
export function isInsideProject(projectRoot: string, path: string): boolean {
  const relativePath = relative(resolve(projectRoot), resolve(path));
  if (relativePath === "") return true;
  if (isAbsolute(relativePath)) return false;
  return relativePath !== ".." && !relativePath.startsWith(`..${sep}`);
}

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
export function resolveEnvFilePath(
  projectRoot: string,
  requested: string,
  options: { baseDir?: string } = {},
): string {
  const trimmed = requested.trim();
  if (!trimmed) {
    throw new EnvFileError("ENV_FILE_INVALID", "No env file was given", [
      "Pass the path of a project env file, for example: tdk up --env-file .env.integration",
    ]);
  }

  const baseDir = options.baseDir ?? process.cwd();
  const absolute = isAbsolute(trimmed) ? resolve(trimmed) : resolve(baseDir, trimmed);

  if (!existsSync(absolute)) {
    throw new EnvFileError("ENV_FILE_INVALID", `Env file not found: ${trimmed}`, [
      "Create it first, for example: cp .env .env.integration",
      "A relative path is resolved against the current directory",
    ]);
  }

  if (!statSync(absolute).isFile()) {
    throw new EnvFileError("ENV_FILE_INVALID", `Env file is not a file: ${trimmed}`, [
      "Point --env-file at an env file, not at a directory",
    ]);
  }

  // The real paths decide whether the file belongs to the project: a project directory reached
  // through a symbolic link (macOS /var -> /private/var) is still the project, and a symbolic link
  // inside the project can point at a file outside it. The engine reads the file through the
  // project mount, so a file outside the project would break the run in the wake gateway.
  if (!isInsideProject(realPathOrSelf(projectRoot), realPathOrSelf(absolute))) {
    throw new EnvFileError("ENV_FILE_INVALID", `Env file is outside the project: ${trimmed}`, [
      "The env file of a run belongs to the project, next to its .env",
      `The project directory is ${projectRoot}`,
    ]);
  }

  return absolute;
}

/** The real path of a file, or the path itself when it cannot be resolved. */
function realPathOrSelf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Reads the env file. The values are secrets, so they are only used to configure the run and to
 * mask output; they are never printed.
 *
 * @throws TdkError when the file cannot be read
 */
export function readEnvFileValues(path: string): Map<string, string> {
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch (error) {
    throw new EnvFileError(
      "ENV_FILE_INVALID",
      `Could not read env file ${path}: ${error instanceof Error ? error.message : String(error)}`,
      ["Check the permissions of the env file"],
    );
  }
  return parseEnv(content);
}

/** The platform keys the file is missing, so the run would start without them. */
export function missingRequiredEnvKeys(values: Map<string, string>): string[] {
  return REQUIRED_ENV_FILE_KEYS.filter((key) => !(values.get(key) ?? "").trim());
}

/**
 * Selects the env file of the run and checks that it can carry the run.
 *
 * The selected file replaces the project `.env` for the run, so it has to carry the same keys. TDK
 * does not complete it: a file the user named may well be committed, and writing a generated
 * credential into it would leak one.
 *
 * @throws TdkError when the file is unusable or misses a key the platform needs
 */
export function selectEnvFile(
  projectRoot: string,
  requested: string,
  options: { baseDir?: string } = {},
): SelectedEnvFile {
  const path = resolveEnvFilePath(projectRoot, requested, options);
  const values = readEnvFileValues(path);
  const missing = missingRequiredEnvKeys(values);
  if (missing.length > 0) {
    throw new EnvFileError(
      "ENV_FILE_INVALID",
      `Env file ${requested} is missing ${missing.join(", ")}`,
      [
        "The selected env file replaces the project .env for this run, so it needs the same keys",
        "Copy them from the project .env (they are per-project credentials)",
        "Run without --env-file to use the project .env",
      ],
    );
  }
  return {
    path,
    relativePath: relative(projectRoot, path).split(sep).join("/"),
    values,
  };
}

/**
 * Points the engine at the selected env file for this run. The engine reads the same variable for
 * the Tilt environment and for the Compose interpolation, so one file drives both.
 */
export function applyEnvFileSelection(selection: SelectedEnvFile): void {
  process.env[PROJECT_ENV_FILE_VAR] = selection.path;
}

/**
 * The vendored engine copy that resolves the env file of the run. A project vendors it at generation
 * time, so a project created before this option existed runs an engine that ignores the selection.
 */
const VENDORED_ENGINE_ENV_FILE =
  ".tdk/.tdk-out/tdk-cli-ext/engine/topologies/tilt/common/utils_env.star";

/**
 * Refuses the run when the project's vendored engine cannot honour the selection. Without this check
 * the flag would be ignored silently and the run would use the project .env after all.
 *
 * @throws TdkError when the vendored engine is older than this option
 */
export function assertEngineSupportsEnvFile(projectRoot: string): void {
  const vendored = resolve(projectRoot, VENDORED_ENGINE_ENV_FILE);
  if (!existsSync(vendored)) return;
  let content: string;
  try {
    content = readFileSync(vendored, "utf-8");
  } catch {
    // An unreadable engine copy fails on its own, with a clearer message than this one.
    return;
  }
  if (content.includes(PROJECT_ENV_FILE_VAR)) return;
  throw new EnvFileError(
    "ENV_FILE_ENGINE_TOO_OLD",
    "The TDK engine in this project does not support --env-file yet",
    [
      "Run `tdk config regenerate` to refresh the vendored engine, then run `tdk up --env-file ...` again",
      `The engine copy is at ${VENDORED_ENGINE_ENV_FILE}`,
    ],
    ENV_FILE_ENGINE_EXIT_CODE,
  );
}

/**
 * A warning when the selected env file would break the local database. The Postgres volume keeps the
 * password it was created with, so a different DB_PASSWORD does not change it.
 */
export function envFileWarning(projectRoot: string, selection: SelectedEnvFile): string | null {
  const projectEnvPath = resolve(projectRoot, ".env");
  if (!existsSync(projectEnvPath)) return null;
  let projectValues: Map<string, string>;
  try {
    projectValues = parseEnv(readFileSync(projectEnvPath, "utf-8"));
  } catch {
    return null;
  }
  const projectPassword = (projectValues.get("DB_PASSWORD") ?? "").trim();
  const selectedPassword = (selection.values.get("DB_PASSWORD") ?? "").trim();
  if (!projectPassword || !selectedPassword || projectPassword === selectedPassword) return null;
  return "The selected env file sets a different DB_PASSWORD than the project .env. The local Postgres volume keeps the password it was created with, so the database may refuse the new one.";
}
