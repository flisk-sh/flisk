// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { DiscoveredResource, DiscoveredStack, ServiceRuntimeState } from "../types/index.js";

/** Label of the group that holds services declared without a stack. */
export const NO_STACK_LABEL = "(no stack)";

/** A service that is failing or still starting. Unknown (not running, starts on request) is neither. */
export function isUnhealthyState(state: ServiceRuntimeState | undefined): boolean {
  return state?.status === "error" || state?.status === "pending";
}

export interface StatusGroup {
  name: string;
  resources: DiscoveredResource[];
  /** Services whose state is `ready`. */
  healthy: number;
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
    total: resources.length,
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
