import { readProjectRecords } from "./project-registry.js";
/**
 * Docker names a project's containers, volumes and networks from the project name alone, and the name is the folder's
 * name. Two folders with the same name (two clones of one starter, git worktrees, `flisk demo` next to a copy of the
 * restaurant example) therefore share every Docker object: the second `flisk up` replaces the first one's containers,
 * both use one database volume, and `flisk down --purge` in either deletes it (#3961). The checks here find the other
 * folder, so `up` and `down --purge` can stop before they touch what it owns.
 */
/** Runs `docker <args>` and returns stdout. */
export type DockerRun = (args: string[]) => string;
/** Another folder that holds a project of the same name, and the Docker containers on record for it. */
export interface ForeignOwner {
    root: string;
    containers: string[];
}
/**
 * The other folders whose containers carry this project's Compose project names. Compose labels every container with the
 * folder it was started from (`com.docker.compose.project.working_dir`), so this needs no state of its own. A folder that
 * is gone, or that no longer names this project, is not an owner: its containers are leftovers that a new run may replace.
 */
export declare function findForeignContainerOwners(name: string, stacks: readonly string[], projectRoot: string, docker?: DockerRun): ForeignOwner[];
/**
 * Other existing folders that were started under this project name, from the record in ~/.flisk/projects. The volume of a
 * stopped project has no container to read a folder from and carries no folder label, so the record is what tells that
 * another folder still uses it.
 */
export declare function findOtherRecordedFolders(name: string, projectRoot: string, readRecords?: typeof readProjectRecords): string[];
export interface OwnerRefusal {
    message: string;
    suggestions: string[];
}
/** The refusal `flisk up` shows when another folder's containers carry this project's name; undefined when there are none. */
export declare function upOwnerRefusal(name: string, owners: readonly ForeignOwner[]): OwnerRefusal | undefined;
/** The refusal `flisk down --purge` shows when another folder uses the objects it would delete; undefined when none does. */
export declare function purgeOwnerRefusal(name: string, owners: readonly ForeignOwner[], recordedFolders: readonly string[]): OwnerRefusal | undefined;
