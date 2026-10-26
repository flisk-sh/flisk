/**
 * Project-Level Features
 *
 * These are infrastructure and optional services enabled at the project level.
 * They are available to all resources and are configured in project.json stacks.
 *
 * Default: All CORE features enabled in pre_alpha stack
 * Optional/premium: disabled by default (can be enabled in optional_infra)
 */
export interface ProjectFeature {
    name: string;
    description: string;
    category: "core" | "optional" | "premium";
    phase: "pre_alpha" | "alpha" | "beta";
    enabled_by_default: boolean;
    dependsOn?: string[];
}
export declare const PROJECT_FEATURES: Record<string, ProjectFeature>;
/**
 * Get all enabled project features: those on by default plus those switched
 * on in `optional_infra`. Each feature appears once, in `PROJECT_FEATURES`
 * order. Names that are not features are ignored, and `false` does not turn
 * off a feature that is on by default.
 */
export declare function getEnabledProjectFeatures(optional_infra?: Record<string, boolean>): string[];
