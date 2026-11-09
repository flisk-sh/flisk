// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import {
  DATABASE_RESOURCE_TYPE,
  type DiscoveredResource,
  type DiscoveredStack,
  type ServiceRuntimeState,
} from "../types/index.js";

/** Label of the group that holds services declared without a stack. */
export const NO_STACK_LABEL = "(no stack)";

/** A service that is failing or still starting. Unknown (not running, starts on request) is neither. */
export function isUnhealthyState(state: ServiceRuntimeState | undefined): boolean {
  return state?.status === "error" || state?.status === "pending";
}

/**
 * A database resource that nothing reports on: it lives inside a Postgres the stack runs, so it has no process of its own and
 * can be neither healthy nor failing. A database with its own container has a state and counts like any service.
 */
export function hasNoOwnProcess(
  resource: Pick<DiscoveredResource, "type">,
  state: ServiceRuntimeState | undefined,
): boolean {
  return resource.type === DATABASE_RESOURCE_TYPE && (state?.status ?? "unknown") === "unknown";
}

/** The services a healthy count is out of: every one that has a process to be healthy. */
export function healthCountedResources<T extends Pick<DiscoveredResource, "name" | "type">>(
  resources: readonly T[],
  states: Record<string, ServiceRuntimeState> | null,
): T[] {
  return resources.filter((resource) => !hasNoOwnProcess(resource, states?.[resource.name]));
}

export interface StatusGroup {
  name: string;
  resources: DiscoveredResource[];
  /** Services whose state is `ready`. */
  healthy: number;
  /** Services that can be healthy: a database with no process of its own is listed but not counted. */
  total: number;
}

/** Services grouped by stack, then the ones without a stack, each with its healthy/total count. */
export function groupServicesByStack(
  stacks: readonly DiscoveredStack[],
  unassigned: readonly DiscoveredResource[],
  states: Record<string, ServiceRuntimeState> | null,
): StatusGroup[] {
  const build = (name: string, resources: readonly DiscoveredResource[]): StatusGroup => ({
    name,
    resources: [...resources],
    healthy: resources.filter((resource) => states?.[resource.name]?.status === "ready").length,
    total: healthCountedResources(resources, states).length,
  });
  const groups = stacks.map((stack) => build(stack.name, stack.resources));
  if (unassigned.length > 0) groups.push(build(NO_STACK_LABEL, unassigned));
  return groups;
}

/** Names of the failing or pending services, in discovery order. */
export function unhealthyServiceNames(
  resources: readonly { name: string }[],
  states: Record<string, ServiceRuntimeState> | null,
): string[] {
  return resources.filter((r) => isUnhealthyState(states?.[r.name])).map((r) => r.name);
}
