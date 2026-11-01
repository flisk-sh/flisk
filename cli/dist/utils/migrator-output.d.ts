/** Standard subfolder under `.flisk/` where migrator outputs are stored. */
export declare const MIGRATOR_OUTPUTS_DIR_NAME = "outputs";
/** Maximum permitted size of a migrator output file in bytes (64 KB). */
export declare const MAX_MIGRATOR_OUTPUT_BYTES: number;
/** Pattern matching `${migrator:KEY}` or `${migrator:KEY:-fallback}` references. */
export declare const MIGRATOR_OUTPUT_REF_REGEX: RegExp;
/** Returns the path to the migrator outputs directory under the project's .flisk folder. */
export declare function migratorOutputsDir(projectRoot: string): string;
/**
 * Returns the absolute path to a specific migrator's output file (.flisk/outputs/<name>.env).
 * Validates the migrator name against path traversal, symlink escape, and invalid characters.
 */
export declare function getMigratorOutputPath(projectRoot: string, migratorName: string): string;
/**
 * Ensures the outputs directory exists with restricted permissions (0o700)
 * and purges any pre-existing output file for this migrator so stale credentials cannot be reused.
 */
export declare function prepareMigratorOutputFile(projectRoot: string, migratorName: string): string;
/** Cleans up migrator output files (all or for a specific migrator). */
export declare function clearMigratorOutputs(projectRoot: string, migratorName?: string): void;
/**
 * Parses a migrator output file (.flisk/outputs/<name>.env).
 * Strict KEY=value contract:
 * - Rejects symbolic links pointing outside project or unreadable states
 * - Rejects files exceeding 64KB
 * - Rejects malformed lines (missing '=')
 * - Rejects invalid key names
 * - Values are treated as sensitive secrets: never logged or evaluated as shell code
 * - Enforces 0o600 file permissions where supported
 */
export declare function parseMigratorOutputFile(filePath: string): Record<string, string>;
/**
 * Validates that any `${migrator:KEY}` references in a service's env map
 * only refer to migrators declared directly in `dependsOn`.
 * Throws FliskError naming the unauthorized migrator if unauthorized.
 */
export declare function validateMigratorOutputReferences(serviceName: string, rawEnv: Record<string, string | undefined> | undefined, dependsOn: readonly string[]): void;
/**
 * Resolves `${migrator:KEY}` and `${migrator:KEY:-fallback}` references in an environment map
 * from the outputs produced by completed migrators.
 * Throws FliskError if an authorized migrator did not produce the expected key and no fallback was specified.
 * Does NOT leak any secret values in error messages.
 */
export declare function resolveMigratorOutputsInEnv(serviceName: string, rawEnv: Record<string, string | undefined> | undefined, dependsOn: readonly string[], outputsByMigrator: Readonly<Record<string, Record<string, string>>>): Record<string, string>;
