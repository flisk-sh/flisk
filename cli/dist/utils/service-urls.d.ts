import type { DiscoveredResource } from "../types/index.js";
import { BRING_YOUR_OWN_TYPE } from "./constants.js";
/**
 * A bring-your-own service with a Traefik route (the default; `exposeViaProxy: false` turns it off). The engine routes it like a
 * backend, at the API host under /api/<name>, and publishes nothing on the host, so this route is the only address it has.
 */
export declare function isRoutedBringYourOwn(resource: DiscoveredResource): boolean;
/** Routed at the API host: backends, MCP servers, agents and routed bring-your-own services. */
export declare function routesAsApi(resource: DiscoveredResource): boolean;
export interface HealthTarget {
    name: string;
    appType: "frontend" | "backend" | "mcp" | "agent" | typeof BRING_YOUR_OWN_TYPE;
    url: string;
}
export interface HealthProbe extends HealthTarget {
    ok: boolean;
    /** HTTP status code, or undefined when the request never completed. */
    status?: number;
    /** Failure reason when the request never completed (DNS, refused, timeout). */
    error?: string;
}
export declare function getProjectName(): string;
/** The project name of a specific project root, for tools that work outside the current directory. */
export declare function getProjectNameFor(root: string | null): string;
export declare function resolveSubdomainBases(ingressPort?: number, projectRoot?: string | null): {
    appBase: string;
    apiBase: string;
};
export declare function appendHealthPath(path: string): string;
/** The route `flisk up` advertises for a service, without the /health suffix. */
export declare function resolveServicePath(resource: DiscoveredResource): string;
/**
 * The ingress URL of one service (no /health suffix), or undefined for services with no Traefik route. This is where the service
 * answers, unlike the Tilt UI port, which serves its own page for any path.
 */
export declare function resolveServiceUrl(resource: DiscoveredResource, ingressPort?: number): string | undefined;
/**
 * Health URLs for every routable service, matching what `flisk up` prints.
 * Workers, libraries, SDKs and migrators have no Traefik route, so they are
 * skipped rather than reported as unreachable.
 */
export declare function buildHealthTargets(resources: DiscoveredResource[], ingressPort?: number): HealthTarget[];
/**
 * The URL `flisk up` and `flisk networks` advertise for each routable service, with no suffix. A service can answer /health while
 * this URL is a 404 (nothing handles the bare path), which is the dead link users click.
 */
export declare function buildAdvertisedTargets(resources: DiscoveredResource[], ingressPort?: number): HealthTarget[];
export declare function pingHealthTarget(target: HealthTarget, timeoutMs: number): Promise<HealthProbe>;
export declare function pingHealthTargets(targets: HealthTarget[], timeoutMs: number): Promise<HealthProbe[]>;
