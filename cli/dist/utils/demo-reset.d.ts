import { projectNameAt, readProjectRecords } from "./project-registry.js";
/** Stops the `tilt up` processes that run this project's Tiltfile, and waits for them to exit. */
export type StopTilt = (tiltfile: string) => Promise<void>;
/**
 * Stop the stack of an existing demo folder before the folder is deleted. Deleting the folder alone leaves its
 * containers running, and a standalone Traefik that stays up keeps port 80 for the next run.
 *
 * The live `tilt up` goes first. `flisk down` needs the Tiltfile, and it can be gone or mid-rewrite while the old
 * stack still runs; then `down` fails and the old Tilt keeps the ports and containers the new run needs, so the
 * second demo sat at "0 of 7 services ready". Returns true when a Flisk project was found.
 */
export declare function stopDemoStack(projectDir: string, runDown?: (dir: string) => void, stopTilt?: StopTilt): Promise<boolean>;
/** Docker calls behind {@link removeStaleProjectVolumes}, injectable so the logic is testable without Docker. */
export interface VolumeRunner {
    /** One entry per volume: its name and the Compose project that created it (empty when it has none). */
    list: () => Array<{
        name: string;
        composeProject: string;
    }>;
    remove: (name: string) => void;
}
/**
 * The exact Compose projects this checkout creates. A prefix match is not enough: project `flisk-demo` would also
 * claim the volumes of a checkout named `flisk-demo-2`, whose Compose projects start with `flisk-demo-`.
 */
export declare function ownedComposeProjects(projectName: string, stacks: string[]): Set<string>;
/**
 * The volumes of this checkout's own Compose projects, by name, or undefined when Docker cannot be listed. An empty list
 * (no volume of this project) and a failed listing are different answers: the demo's protection check must not read a
 * failure as "nothing to protect" and then clean up with a second listing (#3963).
 */
export declare function tryListStaleProjectVolumes(projectName: string, docker?: VolumeRunner, stacks?: string[]): string[] | undefined;
/** Like {@link tryListStaleProjectVolumes}, but a failed listing is an empty list. */
export declare function listStaleProjectVolumes(projectName: string, docker?: VolumeRunner, stacks?: string[]): string[];
/** Removes exactly these volumes and nothing else; one still in use by a container is skipped. Returns the names removed. */
export declare function removeProjectVolumes(names: readonly string[], docker?: VolumeRunner): string[];
/**
 * Remove the Docker volumes an earlier run of this project left behind. A fresh demo clone generates a new random
 * DB_PASSWORD, but Postgres keeps the password of the data directory it was first started with and ignores
 * POSTGRES_PASSWORD afterwards, so the second `flisk demo` failed at the migrator with Prisma P1000.
 * A volume still mounted by a running container cannot be removed and is skipped. Returns the names removed.
 *
 * A volume carries no folder, so this cannot tell the demo's leftovers from another project of the same name: check
 * {@link foldersSharingProjectName} against the same listing first, and remove that listing with {@link removeProjectVolumes}.
 */
export declare function removeStaleProjectVolumes(projectName: string, docker?: VolumeRunner, stacks?: string[]): string[];
/**
 * The other folders that still hold a project of this name, from the record in ~/.flisk/projects. The starters `demo` and
 * `restaurant` are one repository, so a copy made with `flisk project restaurant` has the demo's project name and its
 * database volume (#3963). A folder that is gone, or now holds another project, is not a sharer.
 */
export declare function foldersSharingProjectName(projectName: string, demoDir: string, readRecords?: typeof readProjectRecords, nameAt?: typeof projectNameAt, isDemo?: (dir: string) => boolean): string[];
/**
 * Whether a one-command run creates a folder the demo may later replace. Only the demo starter qualifies: `flisk restaurant`
 * clones the same repository, with the same project name and database volume, but it is the user's own copy (#3963).
 * It has to depend on the starter and not on `--project`, because the demo journey runs `flisk demo --project <dir>`.
 */
export declare function shouldMarkDemoFolder(starter: string, reused: boolean): boolean;
/** True when the Docker demo created the folder (see {@link markDemoFolder}). */
export declare function isDemoFolder(dir: string): boolean;
/** Records that `flisk demo` created this folder, so a later demo may replace its database volume. Never throws. */
export declare function markDemoFolder(dir: string): void;
/**
 * What the demo says when it would delete the database of another folder's project of the same name. `message` and
 * `hint` are short because the demo's frame cuts a line at the terminal width; `detail` goes to the log file.
 */
export declare function sharedNameRefusal(projectName: string, folders: readonly string[], volumes: readonly string[]): {
    message: string;
    hint: string;
    detail: string;
};
/** The `project.name` of a Flisk project folder, or undefined when it has none. */
export declare function readProjectName(projectDir: string): string | undefined;
