/**
 * Resource-Level Features
 *
 * These are code generators and configurations that run per-service/resource.
 * They are controlled via the featuresEnabled: [] array in each service.json file.
 *
 * Frontend services: api-client, env-config, api-index (enabled by default)
 * Backend services: prisma (enabled by default)
 */
import type { ResourceType } from "../types/index.js";
export interface ResourceFeature {
    name: string;
    description: string;
    applies_to: ResourceType[];
    enabled_by_default: boolean;
    generator_file: string;
    output_file: string;
    category?: "core" | "optional" | "premium";
}
export declare const RESOURCE_FEATURES: Record<string, ResourceFeature>;
/**
 * Get default features for a resource type
 */
export declare function getDefaultFeaturesForResourceType(resourceType: ResourceType): string[];
/**
 * Get all generators for a resource type (for documentation)
 */
export declare function getGeneratorsForResourceType(resourceType: ResourceType): ResourceFeature[];
