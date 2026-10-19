import { findProjectRoot } from "./paths.js";
import { discoverResources, discoverResourcesWithProblems, discoverStacks, getAllStacks, warnAboutSkippedFiles, } from "./services.js";
const cachedContextByRoot = new Map();
let cachedDefaultContext = null;
export function clearDiscoveryCache() {
    cachedContextByRoot.clear();
    cachedDefaultContext = null;
}
export function createDiscoveryContext(forceRefresh = false) {
    const projectRoot = findProjectRoot();
    if (!forceRefresh) {
        const cached = projectRoot ? cachedContextByRoot.get(projectRoot) : cachedDefaultContext;
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
    if (projectRoot) {
        cachedContextByRoot.set(projectRoot, context);
    }
    else {
        cachedDefaultContext = context;
    }
    return context;
}
