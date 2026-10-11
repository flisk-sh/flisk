import type { DiscoveredResource, DiscoveredStack } from "../types/index.js";
/**
 * Groups the shared platform Postgres for `tdk status`.
 *
 * One Postgres instance serves the whole project. Each stack that uses it gets its own database named
 * `<project>_<stack>` (see #584), and the services in that stack use that database. This is pure: it takes discovered
 * stacks and does no I/O, so it can be tested without Docker or Tilt.
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
export declare function groupSharedPostgres(projectName: string, stacks: DiscoveredStack[]): SharedPostgresInstance | null;
/** `project.name` from `.tdk/project.json`, or null when the project file is missing or unreadable. */
export declare function readProjectName(projectRoot: string): string | null;
