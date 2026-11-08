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
    /**
     * True for a project `flisk up` recorded, whose objects were matched by their exact names. Only these can be pruned:
     * the others are any Compose project whose folder is gone, which need not be Flisk's.
     */
    recorded: boolean;
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
export declare function findStaleProjects(options?: {
    commandRunner?: CommandRunner;
    pathChecker?: (p: string) => boolean;
    /** Projects recorded by `flisk up` (default: ~/.flisk/projects). */
    records?: ProjectRecord[];
    /** Whether a folder still holds the project (default: reads its .flisk/project.json). */
    holds?: (root: string, name: string) => boolean;
}): StaleProjectsReport;
export interface PrunedStaleProject {
    name: string;
    removed: ProjectArtifacts;
    kept: PurgeResult["kept"];
}
/**
 * Deletes what {@link findStaleProjects} listed for each stale project `flisk up` recorded: containers, then volumes,
 * networks and images. Unrecorded ones are left alone and named in `skipped`. A project whose objects were all removed
 * is also dropped from the `flisk up` record, so it is not reported again.
 */
export declare function pruneStaleProjects(staleProjects: StaleProject[], options?: {
    docker?: DockerRun;
    forget?: (name: string) => void;
}): {
    projects: PrunedStaleProject[];
    skipped: string[];
};
