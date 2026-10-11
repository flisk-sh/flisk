import type { DiscoveredResource } from "../types/index.js";
export interface HealthTarget {
    name: string;
    appType: "frontend" | "backend" | "mcp";
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
export declare function resolveSubdomainBases(ingressPort?: number): {
    appBase: string;
    apiBase: string;
};
export declare function appendHealthPath(path: string): string;
/** The route `tdk up` advertises for a service, without the /health suffix. */
export declare function resolveServicePath(resource: DiscoveredResource): string;
/**
 * Health URLs for every routable service, matching what `tdk up` prints.
 * Workers, libraries, SDKs and migrators have no Traefik route, so they are
 * skipped rather than reported as unreachable.
 */
export declare function buildHealthTargets(resources: DiscoveredResource[], ingressPort?: number): HealthTarget[];
/**
 * The URL `tdk up` and `tdk networks` advertise for each routable service, with no suffix. A service can answer /health while
 * this URL is a 404 (nothing handles the bare path), which is the dead link users click.
 */
export declare function buildAdvertisedTargets(resources: DiscoveredResource[], ingressPort?: number): HealthTarget[];
export declare function pingHealthTarget(target: HealthTarget, timeoutMs: number): Promise<HealthProbe>;
export declare function pingHealthTargets(targets: HealthTarget[], timeoutMs: number): Promise<HealthProbe[]>;
