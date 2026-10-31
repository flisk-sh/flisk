import type { DiscoveredResource, DiscoveredStack, ProjectCapabilities, ProjectConfig } from "../types/index.js";
import { getEnabledCapabilities, isDatabaseCapabilityEnabled } from "./capabilities.js";
export { getEnabledCapabilities, isDatabaseCapabilityEnabled };
export interface SharedInfraOptions {
    capabilities?: ProjectCapabilities;
    database?: boolean;
    projectRoot?: string;
    [key: string]: unknown;
}
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
/** A resource uses the shared database when its features or dependsOn ask for it. */
export declare function usesSharedPostgres(resource: DiscoveredResource): boolean;
export declare function groupSharedPostgres(projectName: string, stacks: DiscoveredStack[], options?: SharedInfraOptions): SharedPostgresInstance | null;
/**
 * Returns the list of shared infrastructure services for the project.
 * Excludes Postgres when the database capability is disabled.
 */
export declare function getSharedInfrastructureList(projectNameOrRootOrOptions?: string | ProjectConfig | SharedInfraOptions, stacksOrOptions?: DiscoveredStack[] | SharedInfraOptions, options?: SharedInfraOptions): string[];
/** `project.name` from `.flisk/project.json`, or null when the project file is missing or unreadable. */
export declare function readProjectName(projectRoot: string): string | null;
