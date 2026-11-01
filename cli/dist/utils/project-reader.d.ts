export declare const DEFAULT_PROJECT_NAME = "flisk-project";
/**
 * Authoritative reader for `.flisk/project.json`.
 * Returns the parsed JSON object, or undefined if missing, unreadable, or malformed.
 */
export declare function readProjectJson(projectRoot?: string | null): Record<string, unknown> | undefined;
/**
 * Reads `project.name` from `.flisk/project.json`.
 * Returns the string name, or undefined if missing or malformed.
 */
export declare function readProjectNameOrUndefined(projectRoot?: string | null): string | undefined;
/**
 * Reads `project.name` with a fallback (default: "flisk-project").
 */
export declare function readProjectNameWithFallback(projectRoot?: string | null, fallback?: string): string;
