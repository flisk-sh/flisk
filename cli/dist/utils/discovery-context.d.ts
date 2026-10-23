import type { DiscoveryContext } from "../types/index.js";
/**
 * Invalidate cached discovery contexts.
 *
 * Lifetime and invalidation contract:
 * Discovery contexts are cached per `projectRoot` for the duration of a command invocation
 * or process to eliminate repeated recursive filesystem traversals.
 *
 * Mutation contract:
 * Any command that creates, mutates, or removes service manifests (`service.json`) or project
 * templates (e.g. `flisk resource`, `flisk project example`, `flisk config migrate`) MUST call
 * `clearDiscoveryCache()` so that subsequent discovery operations within the same process
 * observe the updated filesystem state.
 *
 * @param projectRoot Optional project root to invalidate. If omitted, all cached contexts are cleared.
 */
export declare function clearDiscoveryCache(projectRoot?: string): void;
/**
 * Create or retrieve the cached discovery context for the current project root.
 *
 * Caches discovery results (resources, problems, stacks, etc.) per project root to prevent
 * redundant disk scans during multi-phase command lifecycles (e.g. `flisk up`).
 *
 * Different project roots maintain separate cache entries and never cross project boundaries.
 *
 * @param forceRefresh When true, bypasses any cached entry and forces a fresh filesystem scan.
 */
export declare function createDiscoveryContext(forceRefresh?: boolean): DiscoveryContext;
