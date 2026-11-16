/**
 * A name in `secrets.required` / `secrets.optional` that `params` or `env` also sets to a literal: the literal reaches the
 * container, so the secret in `.env` is silently never used (an admin account created with "changeme").
 */
export declare const ENV_NAME_PATTERN: RegExp;
/** Line breaks (including the Unicode ones YAML 1.1 honours) and other control characters. */
export declare function hasLineBreakOrControl(text: string): boolean;
/** Plain text that is safe inside a JSON (double-quoted YAML) string: no line break or control character. */
export declare const isPlainText: (value: unknown) => value is string;
