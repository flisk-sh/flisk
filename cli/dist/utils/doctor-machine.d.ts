import type { CheckResult } from "../types/index.js";
export declare const WSL2_DOCTOR_MESSAGE = "WSL2 detected. Use Docker Desktop WSL integration. Guide: docs/wsl2.md";
export declare function checkWslProjectLocation(projectPath: string, strict: boolean, isWsl?: boolean): CheckResult;
/** True for IPv4 0.0.0.0 and any IPv6 unspecified form (::, 0:0::0, [::], ...). */
export declare function isWildcardBindAddress(value: string): boolean;
/**
 * Dev ports (Traefik, Postgres) bind to 127.0.0.1 by default. FLISK_BIND_ADDRESS
 * opts in to another address; a wildcard exposes them to every machine on the
 * network (GHSA-3hj3-f39v-j2x5).
 */
export declare function checkPublishedBindAddress(env?: NodeJS.ProcessEnv, strict?: boolean): CheckResult;
export declare function checkEnvironmentVariables(): CheckResult;
export declare function checkMasterConfigs(): CheckResult;
/**
 * Checks the project's minimum and exact pinned CLI version.
 * Shared with `flisk up` so both commands report the same message and fix.
 */
export declare function checkFliskVersion(currentVersion?: string): CheckResult;
/** A CLI older than the latest release is a warning, never a failure; an unreachable registry is skipped (#4119). */
export declare function checkLatestFliskVersion(currentVersion?: string, lookup?: () => Promise<string | null>): Promise<CheckResult>;
