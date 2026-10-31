import type { DiscoveredResource, DiscoveredStack, ProjectCapabilities } from "../types/index.js";
/** Where `groupSharedPostgres` reads the database capability: the project root, or a flag such as `--no-database`. */
export interface SharedInfraOptions {
    capabilities?: ProjectCapabilities;
    database?: boolean;
    projectRoot?: string;
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
/**
 * Like `usesSharedPostgres`, but a dependsOn on one of `databaseNames` (the appNames of the project's `database`
 * resources, which name that same Postgres) also counts.
 */
export declare function usesSharedPostgresAmong(resource: DiscoveredResource, databaseNames: readonly string[]): boolean;
export declare function groupSharedPostgres(projectName: string, stacks: DiscoveredStack[], options?: SharedInfraOptions): SharedPostgresInstance | null;
/** `project.name` from `.flisk/project.json`, or null when the project file is missing or unreadable. */
export declare function readProjectName(projectRoot: string): string | null;
