/** The swarm starter: one coordinator and three workers, all local processes (no Docker). */
export declare const SWARM_COORDINATOR_PORT = 4100;
export declare const SWARM_WORKERS = 3;
export declare const MAX_GOAL_SIZE_MB = 5; // Set a maximum goal size limit

/** The service.json of each service, keyed by its path in the project folder. */
export declare function swarmManifests(): Record<string, Record<string, unknown>>;

/** Writes the swarm project into `dir`. */
export declare function writeSwarmProject(dir: string, readTemplate?: (name: string) => string): void;

/** Validates the goal size before processing */
export function validateGoalSize(goalSizeMB: number): void {
    if (goalSizeMB > MAX_GOAL_SIZE_MB) {
        throw new Error(`Goal size exceeds the maximum limit of ${MAX_GOAL_SIZE_MB} MB.`);
    }
}