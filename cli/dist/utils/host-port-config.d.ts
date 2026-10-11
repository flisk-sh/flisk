import { type HostPortPlan } from "./host-port-plan.js";
export declare function isDockerPortOwnedByProject(dockerPs: string, projectPrefix: string, port: number): boolean;
export declare function readSavedHostPortPlan(projectRoot: string): HostPortPlan | null;
export declare function writeSavedHostPortPlan(projectRoot: string, plan: HostPortPlan): void;
export declare function exportHostPortPlan(plan: HostPortPlan): void;
/** Reuse this project's last selection when its ports are still free or held by its own containers. */
export declare function getHostPortPlan(projectRoot: string, options?: {
    inspectDocker?: boolean;
    isPortFree?: (port: number) => Promise<boolean>;
}): Promise<HostPortPlan>;
