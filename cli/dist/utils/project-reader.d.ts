export declare const DEFAULT_PROJECT_NAME = "flisk-project";
/**
 * Authoritative reader for `.flisk/project.json`.
 * Returns the parsed JSON object, or undefined if missing, unreadable, or malformed.
 */
export declare function readProjectJson(projectRoot?: string | null): Record<string, unknown> | undefined;
/**
 * Reads the project name for one checkout, lower-cased as Docker Compose names it (#1519).
 *
 * The first source wins: `FLISK_PROJECT_NAME` for this process, the gitignored `.flisk/project.local.json`, then the
 * tracked `.flisk/project.json`. The first two are uncommitted, so a second git worktree can run `flisk up` without
 * editing the shared config (#4046). Pass an empty `env` when inspecting another checkout: a shell override belongs to
 * the current process, not to every folder on this machine.
 */
export declare function readProjectNameOrUndefined(projectRoot?: string | null, env?: NodeJS.ProcessEnv): string | undefined;
/**
 * Reads `project.name` with a fallback (default: "flisk-project"), honouring the checkout override.
 */
export declare function readProjectNameWithFallback(projectRoot?: string | null, fallback?: string): string;
