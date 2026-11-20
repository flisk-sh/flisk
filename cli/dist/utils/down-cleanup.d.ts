type CommandRunner = (command: string, args: string[]) => string;
type AsyncCommandRunner = (command: string, args: string[]) => Promise<string>;
/** The engine prefixes networks with the project name, hyphens turned into underscores. */
export declare function projectNetworkNames(projectName: string): string[];
/**
 * Prefixes of Flisk projects among `networkNames`, from the networks the engine creates. Generic suffixes such as
 * `backend` also occur in non-Flisk compose projects, so a prefix counts only if it has a Traefik network, which
 * only Flisk creates.
 */
export declare function fliskNetworkPrefixes(networkNames: string[]): Set<string>;
/** The Flisk project prefix a network belongs to (`umami` for `umami_backend`), or null. */
export declare function fliskNetworkOwner(name: string, prefixes: Set<string>): string | null;
export interface PruneNetworksResult {
    removed: string[];
    /** Networks that exist but Docker refused to remove, usually because a container is still attached. */
    kept: {
        name: string;
        reason: string;
    }[];
}
/** The names from `docker network ls`, for callers that already listed networks before pruning (#4173). */
export declare function listProjectNetworks(commandRunner?: CommandRunner): string[];
/**
 * Remove this project's own networks. Only the exact names the engine creates are touched, and `docker network rm`
 * itself refuses a network that still has containers attached, so another project's networks and in-use networks
 * are never removed. `existingNetworks` reuses a list read earlier on the idle path, avoiding a second network ls.
 */
export declare function pruneProjectNetworks(projectName: string, commandRunner?: CommandRunner, existingNetworks?: readonly string[]): PruneNetworksResult;
export interface PruneNetworksPlan {
    /** Networks `--prune-networks` would remove: they exist and no container outside the stopped stacks is attached. */
    remove: string[];
    /** Networks it would leave in place, with the reason (another container is attached, or Docker could not list them). */
    keep: {
        name: string;
        reason: string;
    }[];
}
/**
 * What {@link pruneProjectNetworks} would do, without removing anything: the same exact project network names, each
 * checked with `docker ps --filter network=<name>` for running attached containers (the reason `docker network rm`
 * refuses one). `down` stops before it prunes, so containers of the compose projects in `stoppedByDown` (this project's
 * stacks, from {@link projectComposeProjects}) do not count: they will be gone by the time the network is removed.
 */
export declare function planProjectNetworkPrune(projectName: string, commandRunner?: CommandRunner, stoppedByDown?: readonly string[]): PruneNetworksPlan;
/**
 * Like {@link findProjectTiltUpPids}, but null when the process list cannot be read (`ps` fails, or the platform has none),
 * so a caller can tell "no tilt up" from "could not look".
 */
export declare function lookupProjectTiltUpPids(tiltfilePath: string, platform?: NodeJS.Platform, commandRunner?: CommandRunner): number[] | null;
/**
 * PIDs of `tilt up` processes started for this project's Tiltfile. Matching on the Tiltfile path keeps another
 * project's Tilt (or a Tilt the user started by hand) untouched.
 */
export declare function findProjectTiltUpPids(tiltfilePath: string, platform?: NodeJS.Platform, commandRunner?: CommandRunner): number[];
/**
 * Roots of the Flisk projects that have a `tilt up` running, read from each process's `-f <root>/.flisk/.flisk-out/Tiltfile`
 * (the Tiltfile `flisk up` passes). Lets `flisk down` find the project when it runs outside one. A root counts only while
 * it still has `.flisk/project.json`.
 */
export declare function findRunningFliskProjects(platform?: NodeJS.Platform, commandRunner?: CommandRunner, isProject?: (root: string) => boolean): string[];
export declare function stopProjectTiltUp(tiltfilePath: string, platform?: NodeJS.Platform, commandRunner?: CommandRunner): number[];
/** Wait (up to `timeoutMs`) for the `tilt up` processes to exit after TERM, so `tilt down` does not race a live Tilt. */
export declare function waitForTiltUpExit(tiltfilePath: string, timeoutMs?: number, findPids?: (tiltfilePath: string) => number[]): Promise<boolean>;
/**
 * The Compose projects Flisk generated for this project, read from the containers' `com.docker.compose.project.working_dir`
 * label (the folder of the first compose file). Matching the folder, not the project name, keeps a project named `shop`
 * from taking `shop-admin`'s containers.
 */
export declare function projectComposeProjects(projectRoot: string, commandRunner?: CommandRunner): string[];
export interface ProjectIdleProbe {
    idle: boolean;
    /** The network list read alongside the idle checks, when the caller asked for it. */
    networkNames?: string[];
}
/**
 * Read the independent inputs of `down`'s idle decision together (#4173): the process list, the Docker container list,
 * and (when asked) the Docker network list. Each failure keeps the old meaning: an unreadable process list or a failed
 * container list means "not idle", and a failed network list leaves pruning to warn later as before.
 */
export declare function probeProjectIdle(projectRoot: string, tiltfilePath: string, options?: {
    platform?: NodeJS.Platform;
    listNetworks?: boolean;
    commandRunner?: AsyncCommandRunner;
}): Promise<ProjectIdleProbe>;
/**
 * Every Compose project that has a container whose working folder is `folder` or inside it, whatever generated it. Used by
 * the demo reset, which deletes the folder: a container left running from an older layout (`flisk_demo_postgres`, from
 * `.tdk/` or `services/platform/...`) keeps its host port and the next run fails with "port is already allocated" (#4124).
 */
export declare function composeProjectsUnder(folder: string, commandRunner?: CommandRunner): string[];
/** Stops and removes the Compose projects of {@link composeProjectsUnder}. Volumes are kept. Never throws. */
export declare function stopComposeProjectsUnder(folder: string, commandRunner?: CommandRunner): ComposeFallbackResult;
export interface ComposeFallbackResult {
    stopped: string[];
    failed: {
        name: string;
        reason: string;
    }[];
}
/**
 * Stops and removes this project's containers with `docker compose -p <name> down`, for when `tilt down` cannot (its Tiltfile
 * fails to evaluate, #2899). Volumes are kept, as `tilt down` keeps them.
 */
export declare function stopProjectComposeProjects(projectRoot: string, commandRunner?: CommandRunner): ComposeFallbackResult;
export {};
