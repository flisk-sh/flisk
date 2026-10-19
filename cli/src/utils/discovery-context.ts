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

export function clearDiscoveryCache(): void {
  cachedContexts.clear();
}

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
