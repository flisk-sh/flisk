import { type DockerRun, type ProjectArtifacts, type PurgeResult } from "./project-purge.js";
import { type ProjectRecord } from "./project-registry.js";
export type CommandRunner = (command: string, args: string[]) => string;
export interface StaleProject {
    name: string;
    recordedPath: string;
    containers: string[];
    volumes: string[];
    networks: string[];
    /** Golden layer tags and service images (`repository:tag`), found for projects recorded by `flisk up`. */
    images: string[];
    containerCount: number;
    volumeCount: number;
    networkCount: number;
    imageCount: number;
    estimatedSizeBytes: number;
    estimatedSize: string;
    cleanupCommand: string;
}
export interface StaleProjectsReport {
    staleProjects: StaleProject[];
    totalContainers: number;
    totalVolumes: number;
    totalNetworks: number;
    totalImages: number;
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
    /** Projects recorded by `flisk up` (default: ~/.flisk/projects). */
    records?: ProjectRecord[];
    /** The project name in a folder, undefined when it holds none (default: reads .flisk/project.json). */
    nameAt?: (root: string) => string | undefined;
}): StaleProjectsReport;
export interface PrunedStaleProject {
    name: string;
    removed: ProjectArtifacts;
    kept: PurgeResult["kept"];
}
/**
 * Deletes what {@link findStaleProjects} listed for each stale project: containers, then volumes, networks and images.
 * A project whose objects were all removed is also dropped from the `flisk up` record, so it is not reported again.
 */
export declare function pruneStaleProjects(staleProjects: StaleProject[], options?: {
    docker?: DockerRun;
    forget?: (name: string) => void;
}): {
    projects: PrunedStaleProject[];
};
