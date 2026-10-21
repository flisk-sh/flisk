type CommandRunner = (command: string, args: string[]) => string;
/** The engine prefixes networks with the project name, hyphens turned into underscores. */
export declare function projectNetworkNames(projectName: string): string[];
/**
 * Prefixes of Flisk projects among `networkNames`, from the networks the engine creates. Generic suffixes such as
 * `backend` also occur in non-Flisk compose projects, so a prefix counts only if it has a Traefik network, which
 * only Flisk creates.
 */
export declare function tdkNetworkPrefixes(networkNames: string[]): Set<string>;
/** The Flisk project prefix a network belongs to (`umami` for `umami_backend`), or null. */
export declare function tdkNetworkOwner(name: string, prefixes: Set<string>): string | null;
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
export declare function stopProjectTiltUp(tiltfilePath: string, platform?: NodeJS.Platform, commandRunner?: CommandRunner): number[];
/** Wait (up to `timeoutMs`) for the `tilt up` processes to exit after TERM, so `tilt down` does not race a live Tilt. */
export declare function waitForTiltUpExit(tiltfilePath: string, timeoutMs?: number, findPids?: (tiltfilePath: string) => number[]): Promise<boolean>;
export {};
