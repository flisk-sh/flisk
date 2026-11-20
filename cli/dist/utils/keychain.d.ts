/** Exact message required on Windows; the provider then falls back to the env file. */
export declare const KEYCHAIN_UNSUPPORTED_MESSAGE = "keychain is not supported on Windows yet";
/** Environment variable names are the only secret names Flisk accepts. */
export declare const SECRET_NAME_PATTERN: RegExp;
export interface KeychainRequest {
    /** The platform binary to run (`security` or `secret-tool`). */
    command: string;
    args: string[];
    /** For `secret-tool store`, the value is read from stdin and never appears in argv. */
    stdin?: string;
    /**
     * `secret-tool search` prints its *attribute names* to stderr. Only that read-only command opts
     * in; no error or tool output is ever returned to the caller as a value or shown to the user.
     */
    includeStderr?: boolean;
}
/** Injectable OS command runner. Returns tool output; failures are thrown by the implementation. */
export type KeychainRunner = (request: KeychainRequest) => string;
/** The real runner. stderr is discarded except for `search`, so a tool cannot leak a value through an error message. */
export declare const defaultKeychainRunner: KeychainRunner;
export interface Keychain {
    /** The project name entries are stored under. */
    readonly project: string;
    readonly platform: NodeJS.Platform;
    get(name: string): string | undefined;
    set(name: string, value: string): void;
    unset(name: string): void;
    /** Names only, never values. */
    list(): string[];
}
export interface CreateKeychainOptions {
    projectRoot?: string;
    /** Overrides the project name from `.flisk/project.json` (for tests). */
    project?: string;
    platform?: NodeJS.Platform;
    runner?: KeychainRunner;
    /** Called once on unsupported platforms. Defaults to printing the required message. */
    onUnsupported?: (message: string) => void;
}
/** The project key shared by all checkouts: `.flisk/project.json`'s name, or the folder name. */
export declare function keychainProjectName(projectRoot: string): string;
/** Refuses an invalid name or one that could turn into another project's keychain entry. */
export declare function assertValidSecretName(name: string): void;
/**
 * Builds the keychain for a project. On Windows the returned object is a no-op fallback: the
 * resolver keeps reading values from the env file and prints the required unsupported message.
 */
export declare function createKeychain(options?: CreateKeychainOptions): Keychain;
