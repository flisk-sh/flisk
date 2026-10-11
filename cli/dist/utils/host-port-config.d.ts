import { type HostPortPlan } from "./host-port-plan.js";
export declare function isDockerPortOwnedByProject(dockerPs: string, projectPrefix: string, port: number): boolean;
export declare function readSavedHostPortPlan(projectRoot: string): HostPortPlan | null;
export declare function writeSavedHostPortPlan(projectRoot: string, plan: HostPortPlan): void;
export declare function exportHostPortPlan(plan: HostPortPlan): void;
/**
 * The HTTP ingress port to probe while a stack is running. getHostPortPlan moves a saved fallback port (8080) back to the
 * preferred one (80) as soon as that is free, which is right for the next `tdk up` but wrong for a running stack: Traefik is still
 * bound to the saved port, so probing the planned one finds nothing and every runtime check is skipped. When this project's own
 * containers hold the saved port, probe that one.
 */
export declare function resolveRuntimeIngressPort(projectRoot: string, plannedPort: number | undefined, readDockerPs?: () => string): number | undefined;
/** Reuse this project's last selection when its ports are still free or held by its own containers. */
export declare function getHostPortPlan(projectRoot: string, options?: {
    inspectDocker?: boolean;
    isPortFree?: (port: number) => Promise<boolean>;
}): Promise<HostPortPlan>;
