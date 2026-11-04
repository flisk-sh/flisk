import type { DiscoveredResource } from "../types/index.js";
/**
 * Shared platform Postgres start predicate.
 *
 * Both names mean the one shared platform Postgres Tilt resource `postgres`. So does the
 * appName of a `database` resource (appType `database`, framework `postgres`), which declares
 * that Postgres in a service.json (#2863).
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
/** The appNames of the `database` resources: each one names the shared platform Postgres. */
export declare function databaseResourceNames(resources: readonly DiscoveredResource[]): string[];
/** True when a dependsOn name means the shared platform Postgres: one of its aliases, or a `database` resource. */
export declare function namesSharedPlatformPostgres(name: string, databaseNames?: readonly string[]): boolean;
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
    /** Resource names whose dependsOn lists postgres, database-management or a database resource. */
    dependsOnUsers: string[];
    /** The `database` resources of the project; any one of them starts the shared Postgres. */
    databaseResources: string[];
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
export declare function databaseManagementEnabled(projectRoot: string, options?: Record<string, unknown>): boolean;
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
export declare function evaluateSharedPlatformPostgres(projectRoot: string, resources?: DiscoveredResource[], options?: Record<string, unknown>): SharedPlatformPostgresEvaluation;
/** Human-readable will-start / will-not-start sentence shared by doctor + verify. */
export declare function sharedPlatformPostgresMessage(evaluation: SharedPlatformPostgresEvaluation): string;
/**
 * Why Postgres starts apart from the feature: "database resource(s) X declare it" and/or
 * "resource(s) Y depend on postgres/database-management/X".
 */
export declare function describeSharedPostgresUsers(evaluation: SharedPlatformPostgresEvaluation): string;
