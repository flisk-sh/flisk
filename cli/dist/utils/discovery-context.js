import { findProjectRoot } from "./paths.js";
import { discoverResources, discoverResourcesWithProblems, discoverStacks, getAllStacks, warnAboutSkippedFiles, } from "./services.js";
const cachedContexts = new Map();
export function clearDiscoveryCache() {
    cachedContexts.clear();
}
export function createDiscoveryContext(forceRefresh = false) {
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
    const resourcesByStack = new Map();
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
        resourcesByStack,
    };
    cachedContexts.set(cacheKey, context);
    return context;
}
