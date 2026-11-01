// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CAPABILITIES } from "../config/platform-standards.js";
import { PROJECT_JSON } from "./constants.js";
import { FliskError } from "./errors.js";
import { writeJsonFile } from "./file-helpers.js";
import { findProjectRoot } from "./paths.js";
import { evaluatePlatformServiceNeeds } from "./platform-services.js";
import { discoverResourcesWithProblems } from "./services.js";
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
/** A flag only turns a capability off, and only a capability Flisk knows of (`--no-ping` is not a capability). */
function applyFlags(caps, flags) {
    if (!flags || typeof flags !== "object")
        return;
    for (const [key, val] of Object.entries(flags)) {
        if (val === false && key in caps)
            caps[key] = false;
    }
    const flagCaps = flags.capabilities;
    if (flagCaps && typeof flagCaps === "object") {
        for (const [key, val] of Object.entries(flagCaps)) {
            if (val === false)
                caps[key] = false;
        }
    }
}
/**
 * A platform service the project's resources do not use is off unless project.json says `true` for it (#2963): a project of
 * only bring-your-own containers that publish their own ports gets neither Traefik nor the shared PostgreSQL. An explicit
 * value, either way, always wins. A project that wraps its own Tiltfile, and one without resources, keeps the defaults.
 */
function applyUnusedPlatformServices(caps, configObj, projectRoot) {
    if (!configObj || configObj.orchestration)
        return;
    const declared = (configObj.capabilities ?? {});
    const inferable = ["gateway", "database"].filter((name) => typeof declared[name] !== "boolean");
    if (inferable.length === 0)
        return;
    let needs;
    try {
        const { resources } = discoverResourcesWithProblems(projectRoot);
        if (resources.length === 0)
            return;
        needs = evaluatePlatformServiceNeeds(resources);
    }
    catch {
        return;
    }
    for (const name of inferable) {
        if (!needs[name].isNeeded)
            caps[name] = false;
    }
}
/**
 * The project's capabilities: the defaults, then `capabilities` in `.flisk/project.json` (or the config passed in), then
 * flags. A flag only turns a capability off. Commander sets `database: true` when `--no-database` is not given, so a
 * `true` from the options must not undo a project that opted out in project.json. An object source may also carry
 * flag-style booleans (`{ gateway: false }`), which turn a capability off the same way.
 */
export function resolveProjectCapabilities(projectRootOrConfig, options) {
    const caps = { ...DEFAULT_CAPABILITIES };
    let configObj;
    let projectRoot;
    if (typeof projectRootOrConfig === "string") {
        projectRoot = projectRootOrConfig;
        configObj = readProjectJson(projectRootOrConfig);
    }
    else if (projectRootOrConfig && typeof projectRootOrConfig === "object") {
        configObj = projectRootOrConfig;
    }
    else {
        projectRoot = findProjectRoot();
        if (projectRoot)
            configObj = readProjectJson(projectRoot);
    }
    applyBooleans(caps, configObj?.capabilities);
    if (projectRoot)
        applyUnusedPlatformServices(caps, configObj, projectRoot);
    if (typeof projectRootOrConfig === "object" && projectRootOrConfig !== null) {
        for (const [key, val] of Object.entries(projectRootOrConfig)) {
            if (val === false && key in caps)
                caps[key] = false;
        }
    }
    applyFlags(caps, options);
    return caps;
}
/** False when the project, the source or a flag turned the named capability off. */
export function isCapabilityEnabled(projectRootOrConfig, capabilityName, options) {
    return resolveProjectCapabilities(projectRootOrConfig, options)[capabilityName] !== false;
}
/** False when the project or a `--no-database` flag opted out of the bundled shared Postgres. */
export function isDatabaseCapabilityEnabled(projectRootOrConfig, options) {
    return isCapabilityEnabled(projectRootOrConfig, "database", options);
}
/** False when the project or a `--no-gateway` flag opted out of the Traefik gateway. */
export function isGatewayEnabled(projectRootOrConfig, options) {
    return isCapabilityEnabled(projectRootOrConfig, "gateway", options);
}
/** Names of the capabilities that are on, for `--json` output. */
export function getEnabledCapabilities(projectRootOrConfig, options) {
    const caps = resolveProjectCapabilities(projectRootOrConfig, options);
    return Object.keys(caps).filter((name) => caps[name] === true);
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
/**
 * Why the router and the shared Postgres run (or not) for this project (#2963): a setting in `.flisk/project.json` or a
 * flag first, then the resources that use the service.
 */
export function describePlatformServices(projectRoot, resources, options) {
    const caps = resolveProjectCapabilities(projectRoot ?? undefined, options);
    const declared = ((projectRoot ? readProjectJson(projectRoot)?.capabilities : undefined) ??
        {});
    const needs = evaluatePlatformServiceNeeds(resources);
    const labels = { gateway: "router (Traefik)", database: "PostgreSQL" };
    return ["gateway", "database"].map((capability) => {
        const isEnabled = caps[capability] !== false;
        const setting = `capabilities.${capability} in .flisk/project.json`;
        let reason;
        if (declared[capability] === false)
            reason = `off: ${setting} is false`;
        else if (!isEnabled && needs[capability].isNeeded)
            reason = "off: turned off by a flag";
        else if (declared[capability] === true)
            reason = `on: ${setting} is true`;
        else if (!isEnabled)
            reason = `off: ${needs[capability].reason}`;
        else if (resources.length === 0)
            reason = "on: default, the project has no resources yet";
        else
            reason = `on: ${needs[capability].reason}`;
        return { capability, name: labels[capability], isEnabled, reason };
    });
}
