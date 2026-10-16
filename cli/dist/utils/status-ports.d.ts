import type { DiscoveredResource } from "../types/index.js";
import type { HostPortPlan } from "./host-port-plan.js";
export interface ServicePorts {
    /** Ingress address (Traefik), or null for resources with no route (workers, libraries, migrators). */
    url: string | null;
    /** The port the process listens on inside its container. */
    containerPort: number | null;
    /** A direct host mapping. TDK publishes services only through the ingress, so this is null today. */
    hostPort: number | null;
    /** Loopback address for a resource with no route but a known port, such as a bring-your-own app. Null otherwise. */
    directUrl: string | null;
}
export interface StackPort {
    name: "ingress-http" | "ingress-https" | "tilt-ui" | "postgres";
    hostPort: number;
    /** What the port is for, so a Dev Container knows which ones to forward. */
    purpose: string;
}
export declare function buildServicePorts(resource: DiscoveredResource, ingressHttp?: number): ServicePorts;
/** Ports a client should forward or open: ingress, Tilt UI, and the published datastore. Not one per service. */
export declare function buildStackPorts(plan: HostPortPlan | null, tiltPort?: number): StackPort[];
