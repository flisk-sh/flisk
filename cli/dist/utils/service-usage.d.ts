/** A command runner that returns stdout. Tests feed it a fake `ps` or `docker stats` table. */
export type UsageCommandRunner = (command: string, args: string[]) => Promise<string> | string;
export interface ServiceUsage {
    /** Sum of `%CPU` over every process sampled in the service's group. */
    cpuPercent: number;
    /** Sum of resident memory in bytes; `ps` reports KB, Docker reports sized units. */
    rssBytes: number;
    /** Null when the source does not report a process count. */
    processes: number | null;
}
/** One entry per requested service; null when it is not running or the sample could not be read. */
export type ServiceUsageMap = Record<string, ServiceUsage | null>;
export interface ServiceUsageTarget {
    name: string;
    /** Recorded pid of a detached local service. On POSIX it is its process-group leader, so it is also the pgid. */
    pid?: number;
    /** Explicit group id, when known. Defaults to `pid`. */
    pgid?: number;
    /** Container from a mixed native run, matched exactly against `docker stats`. */
    container?: string;
    /** Compose service name of a Docker/Tilt resource, matched against container names. */
    service?: string;
    /** Compose project of the resource's stack, so a same-named container of another project is not matched. */
    composeProject?: string;
    /** True for a service of a Docker/Tilt project (no local pid on record). */
    docker?: boolean;
}
export interface SampleServiceUsageOptions {
    platform?: NodeJS.Platform;
    runner?: UsageCommandRunner;
}
interface ProcessGroupSample {
    cpuPercent: number;
    rssBytes: number;
    processes: number;
}
export declare const PS_ARGS: string[];
export declare const DOCKER_STATS_ARGS: string[];
/** `ps -axo pgid=,rss=,pcpu=` gives PGID, RSS (KB) and %CPU, in that order. */
export declare function parseProcessGroups(output: string): Map<number, ProcessGroupSample>;
interface ContainerSample extends ServiceUsage {
    name: string;
}
/** Docker's template prints one tab-separated row per running container. */
export declare function parseDockerStats(output: string): ContainerSample[];
/**
 * Samples local process groups and Docker containers once per call, without writing anything.
 *
 * Only --usage calls this: without the flag no `ps` or `docker stats` process is started. On Windows all entries are null,
 * because neither `ps` process groups nor a Docker-equivalent service mapping are available there.
 */
export declare function sampleServiceUsage(targets: readonly ServiceUsageTarget[], options?: SampleServiceUsageOptions): Promise<ServiceUsageMap>;
export {};
