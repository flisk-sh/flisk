// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { isDatabaseCapabilityEnabled, isGatewayEnabled, } from "./capabilities.js";
import { toComposeProjectName } from "./compose-project-name.js";
import { DATABASE_MANAGEMENT_FEATURE } from "./constants.js";
import { readProjectNameOrUndefined } from "./project-reader.js";
import { databaseResourceNames, namesSharedPlatformPostgres } from "./shared-platform-postgres.js";
export const SHARED_INFRA_SERVICES = {
    traefik: {
        name: "traefik",
        capability: "gateway",
        description: "Traefik reverse proxy",
    },
    postgres: {
        name: "postgres",
        capability: "database",
        description: "PostgreSQL database",
    },
};
/**
 * Returns the list of shared infrastructure service names based on enabled capabilities.
 * When gateway is disabled, Traefik is excluded.
 */
export function getSharedInfrastructureList(configOrOptions) {
    const list = [];
    if (isGatewayEnabled(configOrOptions)) {
        list.push(SHARED_INFRA_SERVICES.traefik.name);
    }
    if (isDatabaseCapabilityEnabled(configOrOptions)) {
        list.push(SHARED_INFRA_SERVICES.postgres.name);
    }
    return list;
}
/**
 * Returns detailed shared infrastructure items based on enabled capabilities.
 */
export function getSharedInfrastructureItems(configOrOptions) {
    const list = getSharedInfrastructureList(configOrOptions);
    return list
        .map((name) => SHARED_INFRA_SERVICES[name])
        .filter(Boolean);
}
/** A resource uses the shared database when its features or dependsOn ask for it. */
export function usesSharedPostgres(resource) {
    return usesSharedPostgresAmong(resource, []);
}
/**
 * Like `usesSharedPostgres`, but a dependsOn on one of `databaseNames` (the appNames of the project's `database`
 * resources, which name that same Postgres) also counts.
 */
export function usesSharedPostgresAmong(resource, databaseNames) {
    const config = resource.config;
    if (!config)
        return false;
    // service.json is not type-checked here, so a malformed value must not throw inside `flisk status`.
    if (Array.isArray(config.featuresEnabled) &&
        config.featuresEnabled.includes(DATABASE_MANAGEMENT_FEATURE))
        return true;
    const dependsOn = Array.isArray(config.dependsOn) ? config.dependsOn : [];
    return dependsOn.some((name) => typeof name === "string" && namesSharedPlatformPostgres(name, databaseNames));
}
export function groupSharedPostgres(projectName, stacks, options) {
    // A project that opted out of the shared Postgres has none to show.
    if (options && !isDatabaseCapabilityEnabled(options.projectRoot, { ...options }))
        return null;
    const prefix = toComposeProjectName(projectName);
    const databases = [];
    const databaseNames = databaseResourceNames(stacks.flatMap((stack) => stack.resources));
    for (const stack of [...stacks].sort((a, b) => a.name.localeCompare(b.name))) {
        const services = stack.resources
            .filter((resource) => usesSharedPostgresAmong(resource, databaseNames))
            .map((resource) => resource.name);
        if (services.length === 0)
            continue;
        databases.push({
            name: `${prefix}_${stack.name.replace(/-/g, "_")}`,
            stack: stack.name,
            services: services.sort(),
        });
    }
    if (databases.length === 0)
        return null;
    return { name: "postgres", databases };
}
/** `project.name` from `.flisk/project.json`, or null when the project file is missing or unreadable. */
export function readProjectName(projectRoot) {
    return readProjectNameOrUndefined(projectRoot) ?? null;
}
