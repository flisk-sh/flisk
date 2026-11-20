import { FliskError } from "./errors.js";
/** The providers this CLI build understands. `""` means the default, `env-file`. */
export declare const SECRET_PROVIDERS: readonly ["env-file", "infisical", "keychain"];
export type SecretProvider = (typeof SECRET_PROVIDERS)[number];
/**
 * Whether this build has a real secret-provider bridge. The free CLI ships only the
 * Infisical stub, so a build that replaces it with a working client opts in explicitly.
 */
export declare function hasSecretBridge(env?: NodeJS.ProcessEnv): boolean;
/** Normalises the setting, preserving the original spelling for error messages. */
export declare function readSecretProvider(env?: NodeJS.ProcessEnv): {
    raw: string;
    value: SecretProvider | "";
};
/** An unknown provider is a usage error, not a missing secret. */
export declare function secretProviderUsageError(env?: NodeJS.ProcessEnv): FliskError | null;
