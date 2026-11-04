import type { DiscoveredResource } from "../types/index.js";
/**
 * Whether the project needs Flisk's own platform services, and why (#2963). The router (Traefik) serves every routed service;
 * the shared PostgreSQL serves every `database` resource and every `dependsOn: postgres`. A project of only bring-your-own
 * containers that publish their own ports and bring their own database needs neither.
 */
export interface PlatformServiceNeed {
    /** True when some resource of the project uses this platform service. */
    isNeeded: boolean;
    /** The resources that use it, sorted. Empty when `isNeeded` is false. */
    users: string[];
    /** One line for `flisk status`: who needs it, or why nothing does. */
    reason: string;
}
export interface PlatformServiceNeeds {
    gateway: PlatformServiceNeed;
    database: PlatformServiceNeed;
}
/**
 * What the resources need. Conservative: only a project whose resources are all bring-your-own is ever found not to need
 * something. Any other resource type (backend, agent, worker, frontend, MCP) keeps both services, as before.
 */
export declare function evaluatePlatformServiceNeeds(resources: readonly DiscoveredResource[]): PlatformServiceNeeds;
/**
 * Whether the project's `.env` needs the keys Flisk generates for its own platform (`DB_PASSWORD` for the shared Postgres,
 * `JWT_SECRET` for local-jwt auth and Infisical) (#3200). A project of only bring-your-own containers that do not use the
 * shared Postgres runs none of the services that read them, so adding them only makes users think the app needs them.
 * Conservative like {@link evaluatePlatformServiceNeeds}: any other resource type, or no resource at all, keeps both.
 */
export declare function needsPlatformSecrets(resources: readonly DiscoveredResource[]): boolean;
