import { type VolumeRunner } from "./demo-reset.js";
import type { ProjectRecord } from "./project-registry.js";
/** Why a scaffold did not remove any volumes. */
export type StaleVolumeSkipReason = "no-project" | "shared-folder" | "running-stack" | "docker-unreadable" | "none";
export interface ScaffoldVolumeCleanupOptions {
    /** Docker calls; injectable so tests need no daemon. */
    docker?: VolumeRunner;
    /** Compose stacks of the scaffold. Discovered from the folder when omitted. */
    stacks?: readonly string[];
    /** Project records to read. Defaults to `~/.flisk/projects`. */
    readRecords?: () => ProjectRecord[];
    /** Folders with running containers that use this project name. Defaults to a Docker `ps` lookup. */
    foreignOwners?: (projectName: string, stacks: readonly string[], projectDir: string) => readonly string[];
}
export interface ScaffoldVolumeCleanupResult {
    projectName?: string;
    /** The exact volumes the Docker listing saw for this project, or undefined when it failed. */
    candidates: string[] | undefined;
    removed: string[];
    skippedReason: StaleVolumeSkipReason;
    sharedFolders: string[];
    runningFolders: string[];
}
/**
 * Clears the Docker volumes that a previous checkout of this project left behind before the freshly
 * scaffolded folder writes a new random `DB_PASSWORD` (#3983). Postgres keeps the password of the
 * volume it was first started with, so a new password against the old data makes the migrator fail
 * with Prisma P1000.
 *
 * Volumes carry only their Compose project name, so the cleanup refuses to touch anything when
 * another folder still holds this project name or has running containers under it. That protects a
 * stopped project's data as well as a live stack; a deleted folder is not a sharer, which is the
 * repeated-scaffold path this fixes. Only the exact Compose projects of this checkout are listed,
 * so a similarly named project is never removed.
 */
export declare function cleanStaleVolumesForScaffold(projectDir: string, options?: ScaffoldVolumeCleanupOptions): ScaffoldVolumeCleanupResult;
