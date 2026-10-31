// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CAPABILITIES } from "../config/platform-standards.js";
import { PROJECT_JSON } from "./constants.js";
import { findProjectRoot } from "./paths.js";
export { DEFAULT_CAPABILITIES };
function readProjectJson(projectRoot) {
    try {
        const file = join(projectRoot, ".flisk", PROJECT_JSON);
        if (!existsSync(file))
            return undefined;
        return JSON.parse(readFileSync(file, "utf-8"));
    }
    catch {
        return undefined;
    }
}
export function resolveProjectCapabilities(projectRootOrConfig, options) {
    const caps = { ...DEFAULT_CAPABILITIES };
    let configObj;
    if (typeof projectRootOrConfig === "string") {
        configObj = readProjectJson(projectRootOrConfig);
    }
    else if (projectRootOrConfig && typeof projectRootOrConfig === "object") {
        configObj = projectRootOrConfig;
    }
    else {
        const root = findProjectRoot();
        if (root) {
            configObj = readProjectJson(root);
        }
    }
    if (configObj) {
        const directCaps = configObj.capabilities;
        if (directCaps && typeof directCaps === "object") {
            for (const [key, val] of Object.entries(directCaps)) {
                if (typeof val === "boolean") {
                    caps[key] = val;
                }
            }
        }
        const proj = configObj.project;
        const projCaps = proj?.capabilities;
        if (projCaps && typeof projCaps === "object") {
            for (const [key, val] of Object.entries(projCaps)) {
                if (typeof val === "boolean") {
                    caps[key] = val;
                }
            }
        }
    }
    if (options && typeof options === "object") {
        if (typeof options.database === "boolean") {
            caps.database = options.database;
        }
        if (options["no-database"] === true) {
            caps.database = false;
        }
        if (typeof options.gateway === "boolean") {
            caps.gateway = options.gateway;
        }
        if (options["no-gateway"] === true) {
            caps.gateway = false;
        }
        const optCaps = options.capabilities;
        if (optCaps && typeof optCaps === "object") {
            for (const [key, val] of Object.entries(optCaps)) {
                if (typeof val === "boolean") {
                    caps[key] = val;
                }
            }
        }
    }
    return caps;
}
export function isDatabaseCapabilityEnabled(projectRootOrConfig, options) {
    return resolveProjectCapabilities(projectRootOrConfig, options).database !== false;
}
export function getEnabledCapabilities(projectRootOrConfig, options) {
    const caps = resolveProjectCapabilities(projectRootOrConfig, options);
    return Object.keys(caps).filter((name) => caps[name] === true);
}
export function getCapabilitiesReport(projectRootOrConfig, options) {
    const caps = resolveProjectCapabilities(projectRootOrConfig, options);
    const result = {};
    for (const [key, val] of Object.entries(caps)) {
        if (val === true) {
            result[key] = true;
        }
    }
    return result;
}
