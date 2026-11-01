import type { DiscoveredResource, HostPortPlan, ProjectCapabilities } from "../types/index.js";
export interface ServicePorts {
    /** Ingress address (Traefik), or null for resources with no route (workers, libraries, migrators). */
    url: string | null;
    /** The port the process listens on inside its container. */
    containerPort: number | null;
    /** A direct host mapping. Flisk publishes services only through the ingress, so this is null today. */
    hostPort: number | null;
    /** Loopback address for a resource with no route but a known port, such as a bring-your-own app. Null otherwise. */
    directUrl: string | null;
    /** Plain host ports of a bring-your-own resource (`extraPorts`), published on 127.0.0.1. Empty for everything else. */
    extraPorts: ExtraPort[];
}
export interface ExtraPort {
    containerPort: number;
    hostPort: number;
    protocol: "tcp" | "udp";
    /**
     * Host address it is published on: 127.0.0.1, 0.0.0.0 when service.json opts in to every interface, or whatever a `publish`
     * template resolves to. A `publish` that names only a port publishes on every interface, which Docker reads as 0.0.0.0.
     */
    bind: string;
    /** Published address, such as 127.0.0.1:443/tcp. */
    address: string;
    /** Set for a `publish` template: the variables behind it and where the shown value came from. */
    publish?: {
        template: string;
        source: "default" | "environment";
        variables: string[];
    };
    /** Set when a `publish` variable holds a value that is not a port or address:port, so Compose would refuse it. */
    problem?: string;
}
/** The loopback range: a mapping on 127.x.x.x is not reachable from the network. */
export declare const isLoopbackAddress: (address: string) => boolean;
/**
 * The `extraPorts` of a bring-your-own resource as Compose publishes them (engine/.../compose/byo_ports.star). Invalid entries are
 * skipped. A `publish` template is resolved the way Compose does it, from `lookup` (the shell, then the project `.env`: pass
 * `projectEnvLookup(projectRoot)`) and then the default in service.json; without a lookup only the shell is read.
 */
export declare function extraPortsOf(resource: DiscoveredResource, lookup?: (name: string) => string | undefined): ExtraPort[];
export interface StackPort {
    name: "ingress-http" | "ingress-https" | "tilt-ui" | "postgres";
    hostPort: number;
    /** What the port is for, so a Dev Container knows which ones to forward. */
    purpose: string;
}
export type StackPortsOptions = {
    capabilities?: ProjectCapabilities;
    gateway?: boolean;
} | ProjectCapabilities | boolean;
export declare function buildServicePorts(resource: DiscoveredResource, ingressHttp?: number, options?: StackPortsOptions, lookup?: (name: string) => string | undefined): ServicePorts;
/** Ports a client should forward or open: ingress, Tilt UI, and the published datastore. Not one per service. */
export declare function buildStackPorts(plan: HostPortPlan | null, tiltPort?: number, options?: StackPortsOptions): StackPort[];
