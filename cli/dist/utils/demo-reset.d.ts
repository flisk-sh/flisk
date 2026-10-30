/**
 * Stop the stack of an existing demo folder before the folder is deleted. Deleting the folder alone leaves its
 * containers running, and a standalone Traefik that stays up keeps port 80 for the next run.
 * Returns true when a Flisk project was found and its `flisk down` ran.
 */
export declare function stopDemoStack(projectDir: string, runDown?: (dir: string) => void): boolean;
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
 * Remove the Docker volumes an earlier run of this project left behind. A fresh demo clone generates a new random
 * DB_PASSWORD, but Postgres keeps the password of the data directory it was first started with and ignores
 * POSTGRES_PASSWORD afterwards, so the second `flisk demo` failed at the migrator with Prisma P1000.
 * A volume still mounted by a running container cannot be removed and is skipped. Returns the names removed.
 */
export declare function removeStaleProjectVolumes(projectName: string, docker?: VolumeRunner): string[];
/** The `project.name` of a Flisk project folder, or undefined when it has none. */
export declare function readProjectName(projectDir: string): string | undefined;
