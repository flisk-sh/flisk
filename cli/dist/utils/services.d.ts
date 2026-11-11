import type { DiscoveredResource, DiscoveredStack, DiscoveryProblem, ResourceMetadata, StackMetadata } from "../types/index.js";
export declare function discoverServiceManifestPaths(projectRoot: string): string[];
export declare function resetPrintedServiceWarnings(): void;
/**
 * Invalidate cached `discoverResourcesWithProblems` results.
 *
 * Shares the lifetime and mutation contract of the discovery context cache:
 * `clearDiscoveryCache()` in discovery-context.ts calls this, so any command that
 * creates, mutates, or removes service manifests (`service.json`) keeps later
 * discovery in the same process observing the updated filesystem state.
 *
 * @param projectRoot Optional project root to invalidate. If omitted, all cached results are cleared.
 */
export declare function clearDiscoveryResultCache(projectRoot?: string): void;
export declare function discoverResourcesWithProblems(projectRoot: string): {
    resources: DiscoveredResource[];
    problems: DiscoveryProblem[];
};
export declare function warnAboutSkippedFiles(problems: DiscoveryProblem[]): void;
/**
 * The `skipped` field of a `--json` envelope: each service.json that discovery skipped, with its path relative to the
 * project root (as `config verify --json` names it) and the reason. Empty when nothing was skipped, so callers can
 * spread it and leave the field out.
 */
export declare function skippedServiceFiles(problems: readonly DiscoveryProblem[], projectRoot?: string | null): {
    skipped?: {
        file: string;
        reason: string;
    }[];
};
export declare function discoverResourcesFromRoot(projectRoot: string): DiscoveredResource[];
export declare function discoverResources(): DiscoveredResource[];
export declare function discoverResourcesStrict(discovered?: {
    resources: DiscoveredResource[];
    problems: DiscoveryProblem[];
}): DiscoveredResource[];
/**
 * Unique, sorted `stack` values across discovered service.json files under `projectRoot`.
 * Tilt's discovery groups services by this same field (see flisk-cli-extensions
 * discovery_orchestrator.star), so these are the names that must appear in a
 * stack's `services` list in .flisk/project.json for that group to be enabled.
 */
export declare function discoverStackNames(projectRoot: string, resources?: DiscoveredResource[]): string[];
export declare function getAllStacks(resources?: DiscoveredResource[]): string[];
export declare function discoverStacks(resources?: DiscoveredResource[]): DiscoveredStack[];
export declare function getResourcesForStack(stackName: string, resources?: DiscoveredResource[]): DiscoveredResource[];
export declare function stackExists(stackName: string, resources?: DiscoveredResource[]): boolean;
export declare function clearMetadataCache(): void;
export declare function getResourceMetadata(resource: DiscoveredResource): ResourceMetadata;
export declare function getStackMetadata(stack: DiscoveredStack): StackMetadata;
