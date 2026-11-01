export declare const DEFAULT_PROJECT_NAME = "flisk-project";
/**
 * Authoritative reader for `.flisk/project.json`.
 * Returns the parsed JSON object, or undefined if missing, unreadable, or malformed.
 */
export declare function readProjectJson(projectRoot?: string | null): Record<string, unknown> | undefined;
/**
 * Reads `project.name` from `.flisk/project.json`, lower-cased.
 * Returns the string name, or undefined if missing or malformed.
 *
 * Docker Compose project names (and the container, network and volume names built from them) must be lowercase, so
 * `"name": "Lychee"` is read as `lychee` here, as the engine reads it (PROJECT_NAME in platform/docker/constants.star) (#1519).
 */
export declare function readProjectNameOrUndefined(projectRoot?: string | null): string | undefined;
/**
 * Reads `project.name` with a fallback (default: "flisk-project").
 */
export declare function readProjectNameWithFallback(projectRoot?: string | null, fallback?: string): string;
