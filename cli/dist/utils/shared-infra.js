// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DATABASE_MANAGEMENT_FEATURE, PROJECT_JSON } from "./constants.js";
import { POSTGRES_DEPENDENCY_NAMES } from "./shared-platform-postgres.js";
/** A resource uses the shared database when its features or dependsOn ask for it. */
export function usesSharedPostgres(resource) {
    const config = resource.config;
    if (!config)
        return false;
    if (config.featuresEnabled?.includes(DATABASE_MANAGEMENT_FEATURE))
        return true;
    return (config.dependsOn ?? []).some((name) => POSTGRES_DEPENDENCY_NAMES.includes(name));
}
export function groupSharedPostgres(projectName, stacks) {
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
/** `project.name` from `.tdk/project.json`, or null when the project file is missing or unreadable. */
export function readProjectName(projectRoot) {
    try {
        const parsed = JSON.parse(readFileSync(join(projectRoot, ".tdk", PROJECT_JSON), "utf-8"));
        return typeof parsed?.project?.name === "string" ? parsed.project.name : null;
    }
    catch {
        return null;
    }
}
