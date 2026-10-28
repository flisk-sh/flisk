type CommandRunner = (command: string, args: string[]) => string;
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
/**
 * Remove this project's own networks. Only the exact names the engine creates are touched, and `docker network rm`
 * itself refuses a network that still has containers attached, so another project's networks and in-use networks
 * are never removed.
 */
export declare function pruneProjectNetworks(projectName: string, commandRunner?: CommandRunner): PruneNetworksResult;
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
export {};
