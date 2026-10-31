// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getEnabledCapabilities, isDatabaseCapabilityEnabled, resolveProjectCapabilities, } from "./capabilities.js";
import { DATABASE_MANAGEMENT_FEATURE, PROJECT_JSON } from "./constants.js";
import { POSTGRES_DEPENDENCY_NAMES } from "./shared-platform-postgres.js";
export { getEnabledCapabilities, isDatabaseCapabilityEnabled };
/** A resource uses the shared database when its features or dependsOn ask for it. */
export function usesSharedPostgres(resource) {
    const config = resource.config;
    if (!config)
        return false;
    // service.json is not type-checked here, so a malformed value must not throw inside `flisk status`.
    if (Array.isArray(config.featuresEnabled) &&
        config.featuresEnabled.includes(DATABASE_MANAGEMENT_FEATURE))
        return true;
    const dependsOn = Array.isArray(config.dependsOn) ? config.dependsOn : [];
    return dependsOn.some((name) => POSTGRES_DEPENDENCY_NAMES.includes(name));
}
export function groupSharedPostgres(projectName, stacks, options) {
    if (options && !isDatabaseCapabilityEnabled(options.projectRoot, options)) {
        return null;
    }
    const prefix = projectName.replace(/-/g, "_");
    const databases = [];
    for (const stack of [...stacks].sort((a, b) => a.name.localeCompare(b.name))) {
        const services = stack.resources.filter(usesSharedPostgres).map((resource) => resource.name);
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
/**
 * Returns the list of shared infrastructure services for the project.
 * Excludes Postgres when the database capability is disabled.
 */
export function getSharedInfrastructureList(projectNameOrRootOrOptions, stacksOrOptions, options) {
    let opts;
    let rootOrConfig;
    if (typeof projectNameOrRootOrOptions === "string") {
        rootOrConfig = projectNameOrRootOrOptions;
    }
    else if (projectNameOrRootOrOptions && typeof projectNameOrRootOrOptions === "object") {
        if ("capabilities" in projectNameOrRootOrOptions || "project" in projectNameOrRootOrOptions) {
            rootOrConfig = projectNameOrRootOrOptions;
        }
        opts = projectNameOrRootOrOptions;
    }
    if (stacksOrOptions && !Array.isArray(stacksOrOptions) && typeof stacksOrOptions === "object") {
        opts = { ...opts, ...stacksOrOptions };
    }
    if (options && typeof options === "object") {
        opts = { ...opts, ...options };
    }
    const caps = resolveProjectCapabilities(rootOrConfig, opts);
    const items = [];
    if (caps.gateway !== false) {
        items.push("gateway");
    }
    if (caps.database !== false) {
        items.push("postgres");
    }
    return items;
}
/** `project.name` from `.flisk/project.json`, or null when the project file is missing or unreadable. */
export function readProjectName(projectRoot) {
    try {
        const parsed = JSON.parse(readFileSync(join(projectRoot, ".flisk", PROJECT_JSON), "utf-8"));
        return typeof parsed?.project?.name === "string" ? parsed.project.name : null;
    }
    catch {
        return null;
    }
}
