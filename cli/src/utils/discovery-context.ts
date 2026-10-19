// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import type { DiscoveredResource, DiscoveryContext } from "../types/index.js";
import { findProjectRoot } from "./paths.js";
import {
  discoverResources,
  discoverResourcesWithProblems,
  discoverStacks,
  getAllStacks,
  warnAboutSkippedFiles,
} from "./services.js";

const cachedContexts = new Map<string, DiscoveryContext>();

/**
 * Invalidate cached discovery contexts.
 *
 * Lifetime and invalidation contract:
 * Discovery contexts are cached per `projectRoot` for the duration of a command invocation
 * or process to eliminate repeated recursive filesystem traversals.
 *
 * Mutation contract:
 * Any command that creates, mutates, or removes service manifests (`service.json`) or project
 * templates (e.g. `tdk resource`, `tdk project example`, `tdk config migrate`) MUST call
 * `clearDiscoveryCache()` so that subsequent discovery operations within the same process
 * observe the updated filesystem state.
 *
 * @param projectRoot Optional project root to invalidate. If omitted, all cached contexts are cleared.
 */
export function clearDiscoveryCache(projectRoot?: string): void {
  if (projectRoot !== undefined) {
    cachedContexts.delete(projectRoot);
  } else {
    cachedContexts.clear();
  }
}

/**
 * Create or retrieve the cached discovery context for the current project root.
 *
 * Caches discovery results (resources, problems, stacks, etc.) per project root to prevent
 * redundant disk scans during multi-phase command lifecycles (e.g. `tdk up`).
 *
 * Different project roots maintain separate cache entries and never cross project boundaries.
 *
 * @param forceRefresh When true, bypasses any cached entry and forces a fresh filesystem scan.
 */
export function createDiscoveryContext(forceRefresh = false): DiscoveryContext {
  const projectRoot = findProjectRoot();
  const cacheKey = projectRoot ?? "";
  if (!forceRefresh) {
    const cached = cachedContexts.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const { resources, problems } = projectRoot
    ? discoverResourcesWithProblems(projectRoot)
    : { resources: discoverResources(), problems: [] };
  const stacks = discoverStacks(resources);
  const stackNames = getAllStacks(resources);

  warnAboutSkippedFiles(problems);

  const unassignedResources = resources.filter((r) => !r.stack);

  const resourcesByStack = new Map<string, DiscoveredResource[]>();
  for (const resource of resources) {
    if (resource.stack) {
      const stackResources = resourcesByStack.get(resource.stack) || [];
      stackResources.push(resource);
      resourcesByStack.set(resource.stack, stackResources);
    }
  }

  const context: DiscoveryContext = {
    resources,
    problems,
    stacks,
    stackNames,
    unassignedResources,
    resourcesByStack,
  };

  cachedContexts.set(cacheKey, context);

  return context;
}
