/** The swarm starter: one coordinator and three workers, all local processes (no Docker). */
export declare const SWARM_COORDINATOR_PORT = 4100;
export declare const SWARM_WORKERS = 3;
/** The service.json of each service, keyed by its path in the project folder. */
export declare function swarmManifests(): Record<string, Record<string, unknown>>;
/** Writes the swarm project into `dir`. */
export declare function writeSwarmProject(dir: string, readTemplate?: (name: string) => string): void;
