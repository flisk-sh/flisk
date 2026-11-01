// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { BRING_YOUR_OWN_TYPE, DATABASE_MANAGEMENT_FEATURE } from "./constants.js";
import { dependsOnOf } from "./dependency-graph.js";
const POSTGRES_NAMES = ["postgres", DATABASE_MANAGEMENT_FEATURE];
function isBringYourOwn(resource) {
    return resource.config?.appType === BRING_YOUR_OWN_TYPE;
}
function wantsSharedPostgres(resource, databaseNames) {
    const features = resource.config?.featuresEnabled;
    if (Array.isArray(features) && features.includes(DATABASE_MANAGEMENT_FEATURE))
        return true;
    return dependsOnOf(resource.config).some((name) => POSTGRES_NAMES.includes(name) || databaseNames.includes(name));
}
/**
 * What the resources need. Conservative: only a project whose resources are all bring-your-own is ever found not to need
 * something. Any other resource type (backend, agent, worker, frontend, MCP) keeps both services, as before.
 */
export function evaluatePlatformServiceNeeds(resources) {
    // A `database` resource only names the shared Postgres: it has no route and nothing else to start.
    const others = resources
        .filter((resource) => !isBringYourOwn(resource) && resource.config?.appType !== "database")
        .map((r) => r.name);
    const routed = resources
        .filter((resource) => isBringYourOwn(resource) && resource.config?.exposeViaProxy !== false)
        .map((r) => r.name);
    const databaseNames = resources
        .filter((resource) => resource.config?.appType === "database")
        .map((r) => r.name);
    const postgresUsers = resources
        .filter((resource) => databaseNames.includes(resource.name) || wantsSharedPostgres(resource, databaseNames))
        .map((r) => r.name);
    const gatewayUsers = [...others, ...routed].sort();
    const databaseUsers = [...new Set([...others, ...postgresUsers])].sort();
    return {
        gateway: {
            isNeeded: gatewayUsers.length > 0,
            users: gatewayUsers,
            reason: gatewayUsers.length > 0
                ? `${gatewayUsers.length} routed ${gatewayUsers.length === 1 ? "service" : "services"}`
                : 'no routed service (every resource is bring-your-own with "exposeViaProxy": false)',
        },
        database: {
            isNeeded: databaseUsers.length > 0,
            users: databaseUsers,
            reason: databaseUsers.length > 0
                ? `used by ${databaseUsers.length} ${databaseUsers.length === 1 ? "resource" : "resources"}`
                : "no database resource and no dependsOn postgres",
        },
    };
}
