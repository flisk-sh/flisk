import type { DiscoveredResource, DiscoveredStack, DiscoveryProblem, ResourceMetadata, StackMetadata } from "../types/index.js";
export declare function discoverServiceManifestPaths(projectRoot: string): string[];
export declare function resetPrintedServiceWarnings(): void;
export declare function discoverResourcesWithProblems(projectRoot: string): {
    resources: DiscoveredResource[];
    problems: DiscoveryProblem[];
};
export declare function warnAboutSkippedFiles(problems: DiscoveryProblem[]): void;
export declare function discoverResourcesFromRoot(projectRoot: string): DiscoveredResource[];
export declare function discoverResources(): DiscoveredResource[];
export declare function discoverResourcesStrict(discovered?: {
    resources: DiscoveredResource[];
    problems: DiscoveryProblem[];
}): DiscoveredResource[];
/**
 * Unique, sorted `stack` values across discovered service.json files under `projectRoot`.
 * Tilt's discovery groups services by this same field (see tdk-cli-extensions
 * discovery_orchestrator.star), so these are the names that must appear in a
 * stack's `services` list in .tdk/project.json for that group to be enabled.
 */
export declare function discoverStackNames(projectRoot: string, resources?: DiscoveredResource[]): string[];
export declare function getAllStacks(resources?: DiscoveredResource[]): string[];
export declare function discoverStacks(resources?: DiscoveredResource[]): DiscoveredStack[];
export declare function getResourcesForStack(stackName: string, resources?: DiscoveredResource[]): DiscoveredResource[];
export declare function stackExists(stackName: string, resources?: DiscoveredResource[]): boolean;
export declare function clearMetadataCache(): void;
export declare function getResourceMetadata(resource: DiscoveredResource): ResourceMetadata;
export declare function getStackMetadata(stack: DiscoveredStack): StackMetadata;
