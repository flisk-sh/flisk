import type { DiscoveredResource, DiscoveredStack, ProjectCapabilities, ProjectConfig } from "../types/index.js";
/**
 * Groups the shared platform Postgres for `flisk status`.
 *
 * One Postgres instance serves the whole project. Each stack that uses it gets its own database named
 * `<project>_<stack>` (see #584), and the services in that stack use that database. `groupSharedPostgres` is pure: it
 * takes discovered stacks and does no I/O, so it can be tested without Docker or Tilt. `readProjectName` is the only
 * function here that reads a file.
 */
export interface SharedInfraDatabase {
    name: string;
    stack: string;
    services: string[];
}
export interface SharedPostgresInstance {
    name: "postgres";
    databases: SharedInfraDatabase[];
}
export interface SharedInfraItem {
    name: string;
    capability: string;
    description: string;
}
export declare const SHARED_INFRA_SERVICES: {
    readonly traefik: {
        readonly name: "traefik";
        readonly capability: "gateway";
        readonly description: "Traefik reverse proxy";
    };
    readonly postgres: {
        readonly name: "postgres";
        readonly capability: "database";
        readonly description: "PostgreSQL database";
    };
};
export type CapabilityConfigInput = ProjectConfig | {
    capabilities?: ProjectCapabilities;
    gateway?: boolean;
} | ProjectCapabilities | string | null | undefined;
/**
 * Reads the capabilities block from `.flisk/project.json` when present.
 */
export declare function readProjectCapabilities(projectRoot: string): ProjectCapabilities | null;
/**
 * Checks whether a given capability is enabled.
 * Defaults to true if unspecified.
 */
export declare function isCapabilityEnabled(configOrOptions: CapabilityConfigInput, capabilityName: string): boolean;
/**
 * Returns whether the gateway capability is enabled.
 */
export declare function isGatewayEnabled(configOrOptions?: CapabilityConfigInput): boolean;
/**
 * Returns a list of capability names that remain enabled.
 */
export declare function getEnabledCapabilities(configOrOptions?: CapabilityConfigInput): string[];
/**
 * Returns the list of shared infrastructure service names based on enabled capabilities.
 * When gateway is disabled, Traefik is excluded.
 */
export declare function getSharedInfrastructureList(configOrOptions?: CapabilityConfigInput): string[];
/**
 * Returns detailed shared infrastructure items based on enabled capabilities.
 */
export declare function getSharedInfrastructureItems(configOrOptions?: CapabilityConfigInput): SharedInfraItem[];
/** A resource uses the shared database when its features or dependsOn ask for it. */
export declare function usesSharedPostgres(resource: DiscoveredResource): boolean;
export declare function groupSharedPostgres(projectName: string, stacks: DiscoveredStack[]): SharedPostgresInstance | null;
/** `project.name` from `.flisk/project.json`, or null when the project file is missing or unreadable. */
export declare function readProjectName(projectRoot: string): string | null;
