import { FliskError } from "./errors.js";
export declare const REDACTED = "[REDACTED]";
export declare class EnvUnreadableError extends FliskError {
    readonly path: string;
    constructor(path: string, reason: string, suggestions?: string[]);
}
/**
 * Shorter values are left alone: masking a two-letter value would hit ordinary words in every log line. The cost is
 * that a short secret in .env is not masked, so keep real secrets at least this long.
 */
export declare const MIN_REDACTED_VALUE_LENGTH = 8;
/**
 * Values of the project's own .env file and of the services' env, longest first so a value that contains another is masked
 * whole. The sources are the project `.env`, the file `--env-file` selected (FLISK_ENV_FILE) and `extraEnvPaths`, each
 * bring-your-own service's `envFile` files, the shell values of the names a service lists under `secrets`, and the `env` and
 * `params` entries of a service whose name says it is a secret (PASSWORD, TOKEN, KEY ...). Throws when an env file exists but
 * cannot be read: continuing without the values would print secrets unmasked.
 */
export declare function envSecretValues(projectRoot: string, extraEnvPaths?: readonly string[], extraSecretValues?: readonly string[]): string[];
/**
 * Secret values held by an `env`-shaped map, using the same rules as a service.json `env`/`params`:
 * only secret-looking names are masked, `${VAR}` is expanded the way the process receives it, and a
 * multiline value is also kept line by line. Local overrides pass their env through here too, so a
 * secret introduced by service.local.json is masked just like one from service.json.
 */
export declare function secretValuesFromEnv(entries: Readonly<Record<string, unknown>> | undefined, vars?: Readonly<Record<string, string | undefined>>): string[];
/**
 * Secret shapes masked wherever they appear, whether or not the value is in an env file: a token an application printed from
 * its own memory, a connection string, a key pair. Each pattern keeps its non-secret part (`Bearer `, `postgres://user:`) so
 * the line stays readable. The list is deliberately short and specific; it is not a secret scanner.
 */
export declare const SECRET_PATTERNS: ReadonlyArray<{
    name: string;
    pattern: RegExp;
    replacement: string;
}>;
/** Masks the secret shapes in SECRET_PATTERNS. */
export declare function redactSecretPatterns(text: string): string;
/** Masks the given secret values, then the secret shapes. */
export declare function redactSecrets(text: string, secrets: readonly string[]): string;
/**
 * Masks a log that arrives line by line. A private key spans many lines and each line is masked alone, so the lines between
 * `-----BEGIN ... PRIVATE KEY-----` and `-----END ... PRIVATE KEY-----` are masked by remembering that the block is open.
 * One guard per stream; a block whose BEGIN line is not in the lines shown cannot be recognised.
 */
export declare function createPrivateKeyLineGuard(): (line: string) => string;
/** Masks the text of log lines of several resources, one private key guard per resource, in the order given. */
export declare function redactLogLines<T extends {
    resource: string | null;
    text: string;
}>(lines: readonly T[], secrets: readonly string[]): T[];
/** Redacts every string inside a JSON-shaped value, so the output stays valid JSON. */
export declare function redactValue<T>(value: T, secrets: readonly string[]): T;
/**
 * A redactor for text that may hold the project's own secrets. When the project's .env exists but cannot be read, the values
 * are unknown, so the redactor throws instead of guessing: the caller then shows and stores nothing rather than raw text. The
 * original error is kept, so a caller can still tell an unreadable .env from another failure.
 *
 * `extraEnvPaths` are the other env files of the run (the file `flisk up --env-file` selected): their values are secrets as
 * much as the ones in the project .env.
 */
export declare function createEnvRedactor(projectRoot: string, extraEnvPaths?: readonly string[], extraSecretValues?: readonly string[]): (text: string) => string;
/** What replaces output that cannot be masked because the project's env files cannot be read. */
export declare const OUTPUT_WITHHELD = "[output withheld: the project's env files could not be read]";
/**
 * The secret values of the project that holds `startDir` (the current directory by default); empty outside a project, so the
 * secret shapes still apply. Null when an env file exists but cannot be read, because the values are then unknown.
 */
export declare function projectSecretValues(startDir?: string): string[] | null;
/** Masks text that came from an application, for the project that holds `startDir`. Never throws, never returns a secret. */
export declare function redactProjectText(text: string, startDir?: string): string;
