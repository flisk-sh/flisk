import type { CheckResult } from "../types/index.js";
export declare const DOCKER_BUILD_CACHE_CHECK = "Docker Build Cache";
/** Warning threshold in GiB (matching DISK_WARN_GIB from #2362). */
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
/** Parses human size string like "11.82GB", "9.19 GB", "500MB", "0B" into bytes. */
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
