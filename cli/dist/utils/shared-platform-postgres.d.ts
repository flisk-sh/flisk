import type { DiscoveredResource } from "../types/index.js";
/**
 * Shared platform Postgres start predicate.
 *
 * Both names mean the one shared platform Postgres Tilt resource `postgres`.
 * The engine start path is selection-bounded (flisk up --only); verify/doctor
 * evaluate the project resource set they already inspect (no flisk up filter).
 * Both surfaces use this same predicate shape over their own resource set.
 *
 * Feature state is read from project.json **and** the generated Tiltfile /
 * spec.master when present, because a stock `flisk up` focus pass expands
 * CORE_INFRA → database-management even when project.json omits it.
 *
 * Spec: openspec/changes/dependson-starts-platform-postgres
 */
export declare const POSTGRES_DEPENDENCY_NAMES: readonly ["postgres", "database-management"];
export declare function isSharedPlatformPostgresDependency(name: string): boolean;
export interface SharedPlatformPostgresEvaluation {
    /** Feature on per project.json + generated Tiltfile/spec.master when present. */
    featureOn: boolean;
    /** project.json always_enabled_infra / enabledStacks only (pre-generate). */
    featureOnFromProjectJson: boolean;
    /** Generated Tiltfile ALWAYS_ENABLED_INFRA includes database-management. */
    featureOnFromTiltfile: boolean;
    /** spec.master RESOURCE_DEFAULTS has database-management: True. */
    featureOnFromSpecMaster: boolean;
    /**
     * True when default focus/CORE_INFRA expansion would enable database-management
     * on a typical `flisk up` even if project.json says off (INFRA_STACK_MAP).
     */
    focusWouldEnableDatabaseManagement: boolean;
    /** Resource names whose dependsOn lists postgres or database-management. */
    dependsOnUsers: string[];
    willStart: boolean;
    reason: "feature" | "dependsOn" | "none";
    /** dependsOn entries that are NOT known services/stacks and NOT shared postgres names (typos). */
    unknownDependsOnNames: Array<{
        resource: string;
        name: string;
    }>;
}
/**
 * True when database-management is on for this project from project.json
 * **or** the generated Tiltfile/spec.master when those files exist.
 */
export declare function databaseManagementEnabled(projectRoot: string): boolean;
/**
 * Evaluate whether shared platform Postgres will start for this project.
 *
 * willStart = featureOn OR any inspected project resource depends on either name.
 * Resource set is project scope (discoverResourcesFromRoot), NOT flisk up --only.
 *
 * Also reports focusWouldEnableDatabaseManagement so doctor/verify can warn that
 * default focus expands CORE_INFRA → database-management even when project.json
 * says the feature is off (the 7.1 gap).
 */
export declare function evaluateSharedPlatformPostgres(projectRoot: string, resources?: DiscoveredResource[]): SharedPlatformPostgresEvaluation;
/** Human-readable will-start / will-not-start sentence shared by doctor + verify. */
export declare function sharedPlatformPostgresMessage(evaluation: SharedPlatformPostgresEvaluation): string;
