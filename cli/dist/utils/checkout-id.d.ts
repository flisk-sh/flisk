/** Environment variable exposing the stable per-checkout 8-hex identifier. */
export declare const CHECKOUT_ID_ENV = "FLISK_CHECKOUT_ID";
/** Environment variable exposing the sanitized per-checkout folder name. */
export declare const CHECKOUT_NAME_ENV = "FLISK_CHECKOUT_NAME";
/** Relative path under a project root where the path-bound checkout id is stored. */
export declare const CHECKOUT_ID_RELATIVE_PATH: string;
/** Stable identity of a local checkout (git worktree, clone, or copy). */
export interface CheckoutIdentity {
    id: string;
    name: string;
}
/**
 * Sanitizes a directory name into lowercase `[a-z0-9-]` characters for use as `FLISK_CHECKOUT_NAME`.
 */
export declare function sanitizeCheckoutName(rawName: string): string;
/**
 * Returns the sanitized checkout name derived from the project root folder name.
 */
export declare function getCheckoutName(projectRoot: string): string;
/**
 * Resolves a project root to its canonical absolute path so symlink aliases
 * (such as `/tmp` vs `/private/tmp` on macOS) match the same stored path.
 */
export declare function canonicalCheckoutPath(projectRoot: string): string;
/**
 * Returns the stable 8-hex-character checkout id for `projectRoot`, creating
 * `.flisk/.project-id` if needed.
 *
 * The file records both the id and the canonical absolute path it was created
 * for. If the recorded path differs from the current path (the folder was
 * copied or moved), a fresh id is generated and persisted so two copies never
 * share one. First-time creation is exclusive (`wx`): when two processes start
 * the same checkout while the file is missing, the one that loses the race
 * adopts the winner's id instead of overwriting it, so both report and inject
 * the same `FLISK_CHECKOUT_ID`.
 */
export declare function getCheckoutId(projectRoot: string, options?: {
    persist?: boolean;
}): string;
/**
 * Returns both the checkout id and sanitized checkout name for `projectRoot`.
 */
export declare function getCheckoutIdentity(projectRoot: string, options?: {
    persist?: boolean;
}): CheckoutIdentity;
/**
 * Returns the environment map (`FLISK_CHECKOUT_ID` and `FLISK_CHECKOUT_NAME`)
 * for `projectRoot`.
 */
export declare function checkoutEnvVars(projectRoot: string, options?: {
    persist?: boolean;
}): Record<typeof CHECKOUT_ID_ENV | typeof CHECKOUT_NAME_ENV, string>;
/**
 * Exports `FLISK_CHECKOUT_ID` and `FLISK_CHECKOUT_NAME` into `target`
 * (defaults to `process.env`) so child processes such as Tilt and Docker Compose
 * inherit them for interpolation.
 */
export declare function exportCheckoutEnv(projectRoot: string, target?: NodeJS.ProcessEnv): CheckoutIdentity;
