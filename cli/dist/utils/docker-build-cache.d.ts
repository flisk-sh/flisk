import type { CheckResult } from "../types/index.js";
export declare const DOCKER_BUILD_CACHE_CHECK = "Docker Build Cache";
/** Keep this threshold in GiB (1 GiB = 1024 ** 3 bytes), matching DISK_WARN_GIB from #2362. */
export declare const DOCKER_BUILD_CACHE_WARN_GIB = 10;
export type DockerRunner = (args: string[]) => Promise<string>;
export declare const defaultDockerRunner: DockerRunner;
export interface DockerBuildCacheReport {
    size: string;
    entries: number;
    reclaimable?: string;
}
export interface DockerBuildCacheInfo {
    size: string;
    sizeBytes: number;
    sizeGib: number;
    entries: number;
    reclaimable: string;
    reclaimableBytes: number;
}
/** Parses human size strings, using SI for kB/MB/GB/TB and IEC for KiB/MiB/GiB/TiB. */
export declare function parseSizeToBytes(raw: string): number;
/**
 * Parses `docker system df --format "{{.Type}}\t{{.TotalCount}}\t{{.Size}}\t{{.Reclaimable}}"` output.
 */
export declare function parseDockerBuildCache(dfOutput: string): DockerBuildCacheInfo | null;
/**
 * Checks the size of Docker's build cache and warns if it exceeds DOCKER_BUILD_CACHE_WARN_GIB.
 */
export declare function checkDockerBuildCache(runner?: DockerRunner, hasDocker?: boolean): Promise<CheckResult & {
    buildCache?: DockerBuildCacheReport;
}>;
/** Validates that the age filter is safe (e.g. "24h", "7d", "168h", "30m", or ISO date). */
export declare function validateCacheUntil(until: string): boolean;
/**
 * Converts a validated age filter into a value Docker accepts for `until=`. Docker parses
 * durations with Go's time.ParseDuration, which has no "d" unit and is case-sensitive, so
 * days become hours (7d -> 168h, 1d12h -> 36h) and units are lowercased (24H -> 24h).
 * ISO dates and anything else pass through unchanged (T and Z keep their case).
 */
export declare function normalizeCacheUntil(until: string): string;
/** Parses reclaimed size from `docker builder prune` output. */
export declare function parseReclaimedFromPrune(stdout: string): string;
/**
 * Prunes Docker build cache using `docker builder prune -f --filter until=<age>`.
 */
export declare function pruneDockerBuildCache(options?: {
    until?: string;
    runner?: DockerRunner;
}): Promise<{
    reclaimed: string;
    until: string;
}>;
/** The build cache is trimmed on `flisk up` when it grows past this many GiB. `0` turns the ceiling off. */
export declare const DEFAULT_BUILD_CACHE_CEILING_GIB = 20;
export declare const BUILD_CACHE_CEILING_ENV = "FLISK_BUILD_CACHE_MAX_GIB";
export declare function resolveBuildCacheCeilingGib(env?: Record<string, string | undefined>): number;
export interface BuildCacheCeilingResult {
    pruned: boolean;
    ceilingGib: number;
    sizeGib?: number;
    /** True when a recent check said the cache is far below the ceiling, so `docker system df` was not run. */
    skipped?: boolean;
}
/** `docker system df` takes 0.8-1.3 s; the ceiling is checked at most this often while the cache is well below it. */
export declare const BUILD_CACHE_CHECK_INTERVAL_MS: number;
/** A last-seen size above this share of the ceiling is re-checked on every `flisk up`; the rest is room to grow in one window. */
export declare const BUILD_CACHE_NEAR_CEILING_RATIO = 0.5;
export interface BuildCacheCeilingOptions {
    /** Home directory holding `.flisk/`; tests pass a temp dir. */
    home?: string;
    now?: () => number;
    /** Identity of the Docker daemon asked; defaults to DOCKER_HOST, DOCKER_CONTEXT and the current docker context. */
    daemon?: string;
    /** Free GiB on the host disk; defaults to a statfs of the home directory. Low or unknown free space forces the check. */
    hostFreeGib?: number | null;
}
/** Which Docker daemon `docker` talks to, so a size measured on one is never trusted for another. */
export declare function dockerDaemonIdentity(env?: Record<string, string | undefined>, home?: string): string;
/**
 * Keeps the shared BuildKit cache from growing without a limit: when it is above the ceiling, the least recently used
 * entries are removed until it fits. Best effort; a Docker that cannot be asked leaves the cache as it is.
 */
export declare function enforceBuildCacheCeiling(run?: DockerRunner, env?: Record<string, string | undefined>, options?: BuildCacheCeilingOptions): Promise<BuildCacheCeilingResult>;
