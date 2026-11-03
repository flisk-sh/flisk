export type CommandRunner = (command: string, args: string[]) => string;
export interface StaleProject {
    name: string;
    recordedPath: string;
    containers: string[];
    volumes: string[];
    networks: string[];
    containerCount: number;
    volumeCount: number;
    networkCount: number;
    estimatedSizeBytes: number;
    estimatedSize: string;
    cleanupCommand: string;
}
export interface StaleProjectsReport {
    staleProjects: StaleProject[];
    totalContainers: number;
    totalVolumes: number;
    totalNetworks: number;
    totalProjects: number;
    totalSizeBytes: number;
    totalSize: string;
}
export declare function parseSizeToBytes(sizeStr: string): number;
export declare function extractProjectRootFromWorkingDir(workingDir: string): string;
export declare function isPathStale(path: string, pathChecker?: (p: string) => boolean): boolean;
/**
 * Discovers projects whose recorded directory no longer exists on disk, but whose Docker containers,
 * volumes, or networks remain (#3119).
 *
 * Strictly read-only: never deletes any Docker resource or file.
 */
export declare function findStaleProjects(options?: {
    commandRunner?: CommandRunner;
    pathChecker?: (p: string) => boolean;
}): StaleProjectsReport;
