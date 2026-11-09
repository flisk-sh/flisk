// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { DATABASE_RESOURCE_TYPE, } from "../types/index.js";
/** Label of the group that holds services declared without a stack. */
export const NO_STACK_LABEL = "(no stack)";
/** A service that is failing or still starting. Unknown (not running, starts on request) is neither. */
export function isUnhealthyState(state) {
    return state?.status === "error" || state?.status === "pending";
}
/**
 * A database resource that nothing reports on: it lives inside a Postgres the stack runs, so it has no process of its own and
 * can be neither healthy nor failing. A database with its own container has a state and counts like any service.
 */
export function hasNoOwnProcess(resource, state) {
    return resource.type === DATABASE_RESOURCE_TYPE && (state?.status ?? "unknown") === "unknown";
}
/** The services a healthy count is out of: every one that has a process to be healthy. */
export function healthCountedResources(resources, states) {
    return resources.filter((resource) => !hasNoOwnProcess(resource, states?.[resource.name]));
}
/** Services grouped by stack, then the ones without a stack, each with its healthy/total count. */
export function groupServicesByStack(stacks, unassigned, states) {
    const build = (name, resources) => ({
        name,
        resources: [...resources],
        healthy: resources.filter((resource) => states?.[resource.name]?.status === "ready").length,
        total: healthCountedResources(resources, states).length,
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
