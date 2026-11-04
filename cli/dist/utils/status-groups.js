/** Label of the group that holds services declared without a stack. */
export const NO_STACK_LABEL = "(no stack)";
/** A service that is failing or still starting. Unknown (not running, starts on request) is neither. */
export function isUnhealthyState(state) {
    return state?.status === "error" || state?.status === "pending";
}
/** Services grouped by stack, then the ones without a stack, each with its healthy/total count. */
export function groupServicesByStack(stacks, unassigned, states) {
    const build = (name, resources) => ({
        name,
        resources: [...resources],
        healthy: resources.filter((resource) => states?.[resource.name]?.status === "ready").length,
        total: resources.length,
    });
    const groups = stacks.map((stack) => build(stack.name, stack.resources));
    if (unassigned.length > 0)
        groups.push(build(NO_STACK_LABEL, unassigned));
    return groups;
}
/** Names of the failing or pending services, in discovery order. */
export function unhealthyServiceNames(resources, states) {
    return resources.filter((r) => isUnhealthyState(states?.[r.name])).map((r) => r.name);
}
