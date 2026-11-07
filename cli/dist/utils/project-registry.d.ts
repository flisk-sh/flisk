/**
 * Where each Flisk project that ran `flisk up` lives, one file per project name in ~/.flisk/projects/.
 *
 * Docker keeps a project's Postgres volume, images and networks after `flisk down`, and nothing on a volume says which
 * folder it belongs to: Compose labels a volume with its Compose project only, and adding our own label to an existing
 * volume makes Compose ask to recreate it (losing the data). So when a project folder is deleted (a scratch or test
 * project, an old demo clone), its volumes could never be told apart from those of a project that is only stopped.
 * This record is what tells them apart: a name whose recorded folders are all gone is stale.
 */
export interface ProjectRecord {
    name: string;
    /** Every folder this project name was started from (worktrees and clones of one repo share a name, and its volumes). */
    roots: string[];
    updatedAt: string;
}
export declare function projectRegistryDir(home?: string): string;
/** The `project.name` in `<root>/.flisk/project.json`, lowercased as the engine names Docker objects, or undefined. */
export declare function projectNameAt(root: string): string | undefined;
/** Records that the project at `projectRoot` started. Never throws: a read-only home only loses the record. */
export declare function recordProjectRoot(projectRoot: string, options?: {
    home?: string;
    now?: Date;
}): void;
export declare function readProjectRecords(home?: string): ProjectRecord[];
export declare function forgetProject(name: string, home?: string): void;
/**
 * True when no recorded folder of this project still holds it: each folder is gone, or now holds a project of another
 * name. A record with no folders is not stale (nothing says it is gone).
 */
export declare function isRecordStale(record: ProjectRecord, nameAt?: (root: string) => string | undefined): boolean;
