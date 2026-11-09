import { type DiscoveredResource, type DiscoveredStack, type ServiceRuntimeState } from "../types/index.js";
/** Label of the group that holds services declared without a stack. */
export declare const NO_STACK_LABEL = "(no stack)";
/** A service that is failing or still starting. Unknown (not running, starts on request) is neither. */
export declare function isUnhealthyState(state: ServiceRuntimeState | undefined): boolean;
/**
 * A database resource that nothing reports on: it lives inside a Postgres the stack runs, so it has no process of its own and
 * can be neither healthy nor failing. A database with its own container has a state and counts like any service.
 */
export declare function hasNoOwnProcess(resource: Pick<DiscoveredResource, "type">, state: ServiceRuntimeState | undefined): boolean;
/** The services a healthy count is out of: every one that has a process to be healthy. */
export declare function healthCountedResources<T extends Pick<DiscoveredResource, "name" | "type">>(resources: readonly T[], states: Record<string, ServiceRuntimeState> | null): T[];
export interface StatusGroup {
    name: string;
    resources: DiscoveredResource[];
    /** Services whose state is `ready`. */
    healthy: number;
    /** Services that can be healthy: a database with no process of its own is listed but not counted. */
    total: number;
}
/** Services grouped by stack, then the ones without a stack, each with its healthy/total count. */
export declare function groupServicesByStack(stacks: readonly DiscoveredStack[], unassigned: readonly DiscoveredResource[], states: Record<string, ServiceRuntimeState> | null): StatusGroup[];
/** Names of the failing or pending services, in discovery order. */
export declare function unhealthyServiceNames(resources: readonly {
    name: string;
}[], states: Record<string, ServiceRuntimeState> | null): string[];
