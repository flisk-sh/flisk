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
