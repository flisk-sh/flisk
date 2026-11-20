import type { DiscoveredResource } from "../types/index.js";
import { type Keychain } from "./keychain.js";
export interface ResolveSecretsOptions {
    env?: NodeJS.ProcessEnv;
    /** Explicit `--env-file` of the run; takes precedence over FLISK_ENV_FILE and the project .env. */
    envFilePath?: string;
    /** Inject a fake keychain instead of calling `security` / `secret-tool`. */
    keychain?: Keychain;
    platform?: NodeJS.Platform;
    onUnsupported?: (message: string) => void;
}
/**
 * Resolves the given names with the selected provider.
 *
 * - `env-file` (the default) returns the env file / shell values and nothing else.
 * - `infisical` returns nothing: the free CLI has no bridge, as before #4702.
 * - `keychain` starts with the env file / shell values and looks up only the gaps in the keychain.
 *   On Windows the keychain is a no-op fallback and prints the required unsupported message.
 */
export declare function resolveSecrets(provider: string, projectRoot: string, names: readonly string[], options?: ResolveSecretsOptions): Record<string, string>;
/** Every secret name a resource declares (required, optional and generated), without values. */
export declare function declaredSecretNames(resources: readonly DiscoveredResource[]): string[];
/** All names declared anywhere in a project, used by `flisk secret set|unset|list`. */
export declare function projectSecretNames(projectRoot: string): string[];
