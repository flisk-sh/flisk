import type { CheckResult, DiscoveredResource } from "../types/index.js";
/** One external network declared under top-level `networks:` in a Docker Compose file. */
export interface ExternalComposeNetworkEntry {
    /** Network key under `networks:`. */
    key: string;
    /** Resolved Docker network name after Compose variable interpolation. */
    name: string;
    /** Raw network name before variable interpolation. */
    rawName: string;
    /** Variable names referenced without a value or default. */
    unresolvedVars: string[];
}
/** One external network declaration tied to its Compose file (path relative to project root). */
export interface ProjectExternalNetwork extends ExternalComposeNetworkEntry {
    file: string;
}
export interface ProjectExternalNetworksScan {
    projectPrefix: string;
    /** `<project>_*` networks that `init-networks` will create automatically. */
    managed: ProjectExternalNetwork[];
    /** Non-`<project>_*` networks (or unresolved interpolations) that `init-networks` will not create. */
    unmanaged: ProjectExternalNetwork[];
    /** Extra `<project>_*` networks that a stale vendored extension will not create until `flisk config regenerate`. */
    staleManaged: ProjectExternalNetwork[];
    /** Networks always created by the fixed platform list (`traefik-public`, `backend`, `database`, plus enabled optional ones). */
    fixedPlatformNetworks: Set<string>;
}
/** True when `name` is a valid, shell-safe Docker network name. */
export declare function isSafeDockerNetworkName(name: string): boolean;
/**
 * Parse every external network declared under top-level `networks:` in a Docker Compose file.
 * Supports `external: true` with or without `name:`, legacy `external: { name: ... }` (block or flow),
 * inline network flow maps, quoted values, inline comments, and Compose variable interpolation.
 */
export declare function parseExternalComposeNetworks(yamlContent: string, env?: Record<string, string | undefined>): ExternalComposeNetworkEntry[];
/**
 * Return every existing project Compose file that `flisk up` loads (platform infra compose files
 * plus any user-authored stack compose files). Paths are absolute.
 */
export declare function discoverProjectComposeFiles(projectRoot: string, resources?: DiscoveredResource[], options?: Record<string, unknown>, env?: NodeJS.ProcessEnv): string[];
/**
 * Scan every Compose file that `flisk up` loads and classify its declared external networks into:
 * - `managed`: `<project>_*` networks that `init-networks` will create automatically
 * - `unmanaged`: non-`<project>_*` networks (or unresolved interpolations) that `init-networks` will not create
 * - `staleManaged`: extra `<project>_*` networks that a stale vendored extension will not create yet
 */
export declare function scanProjectExternalNetworks(projectRoot: string, resources?: DiscoveredResource[], env?: NodeJS.ProcessEnv, options?: Record<string, unknown>): ProjectExternalNetworksScan;
/**
 * Warnings for `flisk config verify` naming external Compose networks that `init-networks` will not
 * create (non-`<project>_*` names, unresolved variables, or a stale vendored extension).
 */
export declare function externalNetworkWarnings(projectRoot: string, resources?: DiscoveredResource[], env?: NodeJS.ProcessEnv): string[];
/**
 * Doctor check for external Docker networks declared by project Compose files.
 * Networks prefixed with `<project>_` are created automatically by `init-networks` (provided the
 * vendored extension is up to date). Any other external network must already exist in Docker or
 * `flisk up` will fail after minutes with "network <name> declared as external, but could not be found".
 */
export declare function checkExternalComposeNetworks(projectRoot?: string, resources?: DiscoveredResource[], listDockerNetworks?: () => string[] | null, env?: NodeJS.ProcessEnv, options?: Record<string, unknown>): CheckResult;
