export interface EnvVariable {
    name: string;
    description: string;
    required: boolean;
    default?: string;
    example?: string;
    /** Written by `completeEnvFile` when a project's .env lacks it (a generated value, or the default). */
    complete?: boolean;
}
/**
 * The keys `completeEnvFile` keeps complete in the project `.env`. An env file that replaces the
 * project `.env` for a run (`flisk up --env-file`) carries the same keys, so it is read from here
 * instead of from a second list.
 */
export declare const COMPLETED_ENV_VARS: string[];
/** Parses the Compose-compatible subset used by Flisk for project environment files. */
export declare function parseEnv(content: string): Map<string, string>;
export declare function generateEnvFile(): string;
export declare function validateEnvFile(projectRoot: string): {
    missing: string[];
    invalid: string[];
    warnings: string[];
};
/**
 * Appends missing keys a newer CLI expects and fills empty generated keys in place.
 * Non-empty values are not changed. Creates the file when it is missing.
 *
 * @returns the names that were added or filled in, empty when the file was already complete
 */
export declare function completeEnvFile(projectRoot: string): string[];
export declare function ensureEnvFile(projectRoot: string): boolean;
