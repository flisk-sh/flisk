import { type HostPortPlan } from "./host-port-plan.js";
export declare function isDockerPortOwnedByProject(dockerPs: string, projectPrefix: string, port: number): boolean;
export declare function readSavedHostPortPlan(projectRoot: string): HostPortPlan | null;
export declare function writeSavedHostPortPlan(projectRoot: string, plan: HostPortPlan): void;
export declare function exportHostPortPlan(plan: HostPortPlan): void;
/**
 * True when a container whose Compose working directory is inside this project publishes the port. A container-name prefix is not
 * enough: tdk_shop_ also matches the containers of a different project called tdk-shop-extra. Compose records the directory each
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
/** Reuse this project's last selection when its ports are still free or held by its own containers. */
export declare function getHostPortPlan(projectRoot: string, options?: {
    inspectDocker?: boolean;
    isPortFree?: (port: number) => Promise<boolean>;
}): Promise<HostPortPlan>;
