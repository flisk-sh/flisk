// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CAPABILITIES } from "../config/platform-standards.js";
import { DATABASE_MANAGEMENT_FEATURE, PROJECT_JSON } from "./constants.js";
import { FliskError } from "./errors.js";
import { POSTGRES_DEPENDENCY_NAMES } from "./shared-platform-postgres.js";
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
 * Reads the capabilities block from `.flisk/project.json` when present.
 */
export function readProjectCapabilities(projectRoot) {
    try {
        const parsed = JSON.parse(readFileSync(join(projectRoot, ".flisk", PROJECT_JSON), "utf-8"));
        return parsed &&
            typeof parsed === "object" &&
            parsed.capabilities &&
            typeof parsed.capabilities === "object"
            ? parsed.capabilities
            : null;
    }
    catch {
        return null;
    }
}
/**
 * Checks whether a given capability is enabled.
 * Defaults to true if unspecified.
 */
export function isCapabilityEnabled(configOrOptions, capabilityName) {
    if (configOrOptions === null || configOrOptions === undefined) {
        return true;
    }
    if (typeof configOrOptions === "string") {
        const fileCaps = readProjectCapabilities(configOrOptions);
        const fileValue = fileCaps?.[capabilityName];
        if (typeof fileValue === "boolean") {
            return fileValue;
        }
        return true;
    }
    if (typeof configOrOptions === "object") {
        const direct = configOrOptions[capabilityName];
        if (typeof direct === "boolean") {
            return direct;
        }
        const caps = configOrOptions.capabilities;
        const capValue = caps && typeof caps === "object" ? caps[capabilityName] : undefined;
        if (typeof capValue === "boolean") {
            return capValue;
        }
    }
    return true;
}
/**
 * Returns whether the gateway capability is enabled.
 */
export function isGatewayEnabled(configOrOptions) {
    return isCapabilityEnabled(configOrOptions, "gateway");
}
/**
 * `flisk up --no-gateway` must not be a silent no-op: the generated Tiltfile and compose files follow `.flisk/project.json`,
 * so the flag is only honoured when the project already opts out there.
 * @throws FliskError when the project still has the gateway on
 */
export function assertGatewayOptOutIsConfigured(projectRoot) {
    if (projectRoot && !isGatewayEnabled(projectRoot))
        return;
    throw new FliskError("--no-gateway needs the gateway turned off in .flisk/project.json; the flag alone does not change the generated files.", [
        'Set "capabilities": { "gateway": false } in .flisk/project.json',
        "Run flisk config regenerate, then flisk up",
    ]);
}
/**
 * Returns a list of capability names that remain enabled.
 */
export function getEnabledCapabilities(configOrOptions) {
    const standardKeys = Object.keys(DEFAULT_CAPABILITIES);
    const extraKeys = [];
    if (typeof configOrOptions === "string") {
        const fileCaps = readProjectCapabilities(configOrOptions);
        if (fileCaps) {
            for (const k of Object.keys(fileCaps)) {
                if (!standardKeys.includes(k) && typeof fileCaps[k] === "boolean") {
                    extraKeys.push(k);
                }
            }
        }
    }
    else if (typeof configOrOptions === "object" && configOrOptions !== null) {
        const caps = configOrOptions.capabilities ?? configOrOptions;
        if (typeof caps === "object" && caps !== null) {
            for (const k of Object.keys(caps)) {
                if (!standardKeys.includes(k) &&
                    typeof caps[k] === "boolean") {
                    extraKeys.push(k);
                }
            }
        }
    }
    const allKeys = [...standardKeys, ...extraKeys];
    return allKeys.filter((cap) => isCapabilityEnabled(configOrOptions, cap));
}
/**
 * Returns the list of shared infrastructure service names based on enabled capabilities.
 * When gateway is disabled, Traefik is excluded.
 */
export function getSharedInfrastructureList(configOrOptions) {
    const list = [];
    if (isGatewayEnabled(configOrOptions)) {
        list.push(SHARED_INFRA_SERVICES.traefik.name);
    }
    if (isCapabilityEnabled(configOrOptions, "database")) {
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
