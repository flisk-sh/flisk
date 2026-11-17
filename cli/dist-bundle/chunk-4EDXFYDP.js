import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  clearDiscoveryResultCache,
  discoverResources,
  discoverResourcesWithProblems,
  discoverStacks,
  getAllStacks,
  warnAboutSkippedFiles
} from "./chunk-2BH5UW2N.js";
import {
  findProjectRoot
} from "./chunk-73W4Y4TI.js";

// dist/utils/discovery-context.js
var cachedContexts = /* @__PURE__ */ new Map();
function clearDiscoveryCache(projectRoot) {
  clearDiscoveryResultCache(projectRoot);
  if (projectRoot !== void 0) {
    cachedContexts.delete(projectRoot);
  } else {
    cachedContexts.clear();
  }
}
function createDiscoveryContext(forceRefresh = false) {
  const projectRoot = findProjectRoot();
  const cacheKey = projectRoot ?? "";
  if (!forceRefresh) {
    const cached = cachedContexts.get(cacheKey);
    if (cached) {
      return cached;
    }
  } else if (projectRoot) {
    clearDiscoveryResultCache(projectRoot);
  }
  const { resources, problems } = projectRoot ? discoverResourcesWithProblems(projectRoot) : { resources: discoverResources(), problems: [] };
  const stacks = discoverStacks(resources);
  const stackNames = getAllStacks(resources);
  warnAboutSkippedFiles(problems);
  const unassignedResources = resources.filter((r) => !r.stack);
  const resourcesByStack = /* @__PURE__ */ new Map();
  for (const resource of resources) {
    if (resource.stack) {
      const stackResources = resourcesByStack.get(resource.stack) || [];
      stackResources.push(resource);
      resourcesByStack.set(resource.stack, stackResources);
    }
  }
  const context = {
    resources,
    problems,
    stacks,
    stackNames,
    unassignedResources,
    resourcesByStack
  };
  cachedContexts.set(cacheKey, context);
  return context;
}

export {
  clearDiscoveryCache,
  createDiscoveryContext
};
