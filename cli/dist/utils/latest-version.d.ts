/** `npx pkg` runs a locally installed copy before it downloads one, so an old install can run silently (#4119). */
export declare const LATEST_VERSION_URL = "https://registry.npmjs.org/@flisk-sh%2fflisk/latest";
export declare const LATEST_VERSION_TIMEOUT_MS = 800;
export declare const LATEST_VERSION_CACHE_TTL_MS: number;
export declare const LATEST_VERSION_CACHE_FILE = "latest-version.json";
export interface LatestVersionOptions {
    env?: NodeJS.ProcessEnv;
    argv?: readonly string[];
    /** Directory that holds the cache file. Defaults to ~/.flisk. */
    cacheDir?: string;
    now?: number;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}
/** True only when both are plain x.y.z versions and `current` is older than `latest`. */
export declare function isOlderVersion(current: string, latest: string): boolean;
/** The registry is not asked on CI, with --offline, FLISK_OFFLINE or NO_UPDATE_NOTIFIER. */
export declare function isLatestVersionCheckSkipped(env?: NodeJS.ProcessEnv, argv?: readonly string[]): boolean;
/**
 * The newest published version, or null when it is unknown. Cached for a day under ~/.flisk, and
 * never slower than the timeout: any failure (offline, slow, bad answer) returns null.
 */
export declare function fetchLatestVersion(options?: LatestVersionOptions): Promise<string | null>;
/** Where the running CLI is installed, for the notice: the folder that holds node_modules, with ~ for home. */
export declare function describeInstallLocation(scriptPath?: string | undefined, home?: string): string | null;
export declare function formatStaleVersionNotice(current: string, latest: string, location: string | null, command?: string): string;
/** The one-line notice, or null when the running version is current, newer, or the registry is unknown. */
export declare function staleVersionNotice(current: string, options?: LatestVersionOptions & {
    scriptPath?: string;
    command?: string;
}): Promise<string | null>;
