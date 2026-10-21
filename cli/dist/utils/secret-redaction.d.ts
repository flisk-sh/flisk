export declare const REDACTED = "[REDACTED]";
export declare class EnvUnreadableError extends Error {
    readonly path: string;
    constructor(path: string, reason: string);
}
/**
 * Shorter values are left alone: masking a two-letter value would hit ordinary words in every log line. The cost is
 * that a short secret in .env is not masked, so keep real secrets at least this long.
 */
export declare const MIN_REDACTED_VALUE_LENGTH = 8;
/**
 * Values of the project's own .env file, longest first so a value that contains another is masked whole. Throws when the
 * file exists but cannot be read: continuing without the values would print secrets unmasked.
 */
export declare function envSecretValues(projectRoot: string, extraEnvPaths?: readonly string[]): string[];
export declare function redactSecrets(text: string, secrets: readonly string[]): string;
/** Redacts every string inside a JSON-shaped value, so the output stays valid JSON. */
export declare function redactValue<T>(value: T, secrets: readonly string[]): T;
/**
 * A redactor for text that may hold the project's own secrets. When the project's .env exists but cannot be read, the values
 * are unknown, so the redactor throws instead of guessing: the caller then shows and stores nothing rather than raw text. The
 * original error is kept, so a caller can still tell an unreadable .env from another failure.
 *
 * `extraEnvPaths` are the other env files of the run (the file `tdk up --env-file` selected): their values are secrets as
 * much as the ones in the project .env.
 */
export declare function createEnvRedactor(projectRoot: string, extraEnvPaths?: readonly string[]): (text: string) => string;
