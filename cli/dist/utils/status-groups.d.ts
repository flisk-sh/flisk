import type { DiscoveredResource, DiscoveredStack, ServiceRuntimeState } from "../types/index.js";
/** Label of the group that holds services declared without a stack. */
export declare const NO_STACK_LABEL = "(no stack)";
/** A service that is failing or still starting. Unknown (not running, starts on request) is neither. */
export declare function isUnhealthyState(state: ServiceRuntimeState | undefined): boolean;
export interface StatusGroup {
    name: string;
    resources: DiscoveredResource[];
    /** Services whose state is `ready`. */
    healthy: number;
    total: number;
}
/** Services grouped by stack, then the ones without a stack, each with its healthy/total count. */
export declare function groupServicesByStack(stacks: readonly DiscoveredStack[], unassigned: readonly DiscoveredResource[], states: Record<string, ServiceRuntimeState> | null): StatusGroup[];
/** Names of the failing or pending services, in discovery order. */
export declare function unhealthyServiceNames(resources: readonly {
    name: string;
}[], states: Record<string, ServiceRuntimeState> | null): string[];
