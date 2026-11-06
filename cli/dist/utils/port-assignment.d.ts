import type { DiscoveredResource, PortAssignableResourceType } from "../types/index.js";
export declare function checkPortStatus(port: number): Promise<"running" | "stopped" | "unknown">;
/**
 * The first free port from basePort. `claim`, when given, also has to accept the port: a real start passes a claimer so two
 * projects starting at once do not both take the same free port (see port-claims.ts).
 */
export declare function findAvailablePort(basePort: number, maxAttempts?: number, claim?: (port: number) => boolean): Promise<number | null>;
export declare function getUsedPorts(resources: DiscoveredResource[]): Set<number>;
export declare function assignPort(resourceType: PortAssignableResourceType, existingResources: DiscoveredResource[]): number;
