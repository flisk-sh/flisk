// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_JSON } from "./constants.js";
import { writeJsonFile } from "./file-helpers.js";
import { findProjectRoot } from "./paths.js";
/** Every capability is on unless `.flisk/project.json` or a flag turns it off. */
export const DEFAULT_CAPABILITIES = { database: true };
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
function applyBooleans(caps, source) {
    if (!source || typeof source !== "object")
        return;
    for (const [key, val] of Object.entries(source)) {
        if (typeof val === "boolean")
            caps[key] = val;
    }
}
/**
 * The project's capabilities: the defaults, then `capabilities` in `.flisk/project.json` (or the config passed in), then flags.
 * A flag only turns a capability off. Commander sets `database: true` when `--no-database` is not given, so a `true` from
 * the options must not undo a project that opted out in project.json.
 */
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
        if (root)
            configObj = readProjectJson(root);
    }
    applyBooleans(caps, configObj?.capabilities);
    if (options && typeof options === "object") {
        if (options.database === false)
            caps.database = false;
        const optCaps = options.capabilities;
        if (optCaps && typeof optCaps === "object") {
            for (const [key, val] of Object.entries(optCaps)) {
                if (val === false)
                    caps[key] = false;
            }
        }
    }
    return caps;
}
/** False when the project or a `--no-database` flag opted out of the bundled shared Postgres. */
export function isDatabaseCapabilityEnabled(projectRootOrConfig, options) {
    return resolveProjectCapabilities(projectRootOrConfig, options).database !== false;
}
/** Names of the capabilities that are on, for `--json` output. */
export function getEnabledCapabilities(projectRootOrConfig, options) {
    const caps = resolveProjectCapabilities(projectRootOrConfig, options);
    return Object.keys(caps).filter((name) => caps[name] === true);
}
/**
 * Saves `capabilities.database: false` in `.flisk/project.json`. Returns true when the file changed, so the caller knows the
 * generated files are now stale and must be regenerated.
 */
export function disableDatabaseCapability(projectRoot) {
    const file = join(projectRoot, ".flisk", PROJECT_JSON);
    const config = readProjectJson(projectRoot);
    if (!config)
        return false;
    const current = config.capabilities;
    const caps = current && typeof current === "object" && !Array.isArray(current)
        ? current
        : {};
    if (caps.database === false)
        return false;
    config.capabilities = { ...caps, database: false };
    writeJsonFile(file, config);
    return true;
}
