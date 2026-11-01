import type { HostPortPlan, ProjectCapabilities } from "../types/index.js";
import { type TiltPortOwner } from "./tilt-port-owner.js";
export declare function isDockerPortOwnedByProject(dockerPs: string, projectPrefix: string, port: number): boolean;
export declare function readSavedHostPortPlan(projectRoot: string): HostPortPlan | null;
/** Reads the saved Tilt UI port selected during the last successful or ongoing `flisk up`. */
export declare function readSavedTiltPort(projectRoot: string): number | null;
export declare function writeSavedHostPortPlan(projectRoot: string, plan: HostPortPlan): void;
export declare function exportHostPortPlan(plan: HostPortPlan): void;
/**
 * True when a container whose Compose working directory is inside this project publishes the port. A container-name prefix is not
 * enough: flisk_shop_ also matches the containers of a different project called flisk-shop-extra. Compose records the directory each
 * project was started from, so that identifies the project exactly. Containers without the label never count.
 */
export declare function isPortHeldByProjectContainers(dockerPs: string, projectRoot: string, port: number): boolean;
/**
 * The HTTP ingress port to probe while a stack is running. getHostPortPlan moves a saved fallback port (8080) back to the
 * preferred one (80) as soon as that is free, which is right for the next `flisk up` but wrong for a running stack: Traefik is still
 * bound to the saved port, so probing the planned one finds nothing and every runtime check is skipped. When this project's own
 * containers hold the saved port, probe that one.
 */
export declare function resolveRuntimeIngressPort(projectRoot: string, plannedPort: number | undefined, readDockerPs?: () => string): number | undefined;
/**
 * Resolves the Tilt UI port for runtime inspection commands (`status`, `logs`, `restart`).
 * Prefers an active Tilt owned by this project or recorded in host-ports.json.
 * If the default port is held by another project's Tilt, ignores it and falls back to
 * this project's saved port or reports foreign isolation.
 */
export declare function resolveRuntimeTiltPort(projectRoot: string, options?: {
    envPort?: string;
    ownerOf?: (port: number) => TiltPortOwner | null;
}): number | null;
/**
 * Reuse this project's last selection when its ports are still free or held by its own containers. Only the ports of the
 * capabilities that are on are planned: with the gateway off, HTTP and HTTPS are never probed (no Traefik binds them).
 */
export declare function getHostPortPlan(projectRoot: string, options?: {
    inspectDocker?: boolean;
    isPortFree?: (port: number) => Promise<boolean>;
    database?: boolean;
    gateway?: boolean;
    capabilities?: ProjectCapabilities;
}): Promise<HostPortPlan>;
/** Which shared containers need a host port: the gateway takes HTTP/HTTPS, the database takes Postgres. */
export interface HostPortCapabilities {
    gateway: boolean;
    database: boolean;
}
/** The host ports a plan places for the capabilities that are on, as `HTTP 80, HTTPS 443, Postgres 5432`. */
export declare function describeHostPortPlan(plan: HostPortPlan, caps: HostPortCapabilities): string;
/** What to set when the host ports for the capabilities that are on cannot be placed. */
export declare function hostPortPlanFix(caps: HostPortCapabilities): string;
