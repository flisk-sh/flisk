// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DATABASE_MANAGEMENT_FEATURE, PROJECT_JSON } from "./constants.js";
import { DEFAULT_ALWAYS_ENABLED_INFRA } from "./project-config-defaults.js";
import { discoverResourcesFromRoot } from "./services.js";
/**
 * Shared platform Postgres start predicate.
 *
 * Both names mean the one shared platform Postgres Tilt resource `postgres`.
 * The engine start path is selection-bounded (tdk up --only); verify/doctor
 * evaluate the project resource set they already inspect (no tdk up filter).
 * Both surfaces use this same predicate shape over their own resource set.
 *
 * Feature state is read from project.json **and** the generated Tiltfile /
 * spec.master when present, because a stock `tdk up` focus pass expands
 * CORE_INFRA → database-management even when project.json omits it.
 *
 * Spec: openspec/changes/dependson-starts-platform-postgres
 */
export const POSTGRES_DEPENDENCY_NAMES = ["postgres", DATABASE_MANAGEMENT_FEATURE];
const PHASE_KEYS = ["pre_alpha", "alpha", "beta", "out_of_scope"];
export function isSharedPlatformPostgresDependency(name) {
    return POSTGRES_DEPENDENCY_NAMES.includes(name);
}
function readProjectJson(projectRoot) {
    try {
        return JSON.parse(readFileSync(join(projectRoot, ".tdk", PROJECT_JSON), "utf-8"));
    }
    catch {
        return undefined;
    }
}
function readTextIfExists(path) {
    try {
        return existsSync(path) ? readFileSync(path, "utf-8") : undefined;
    }
    catch {
        return undefined;
    }
}
// Finds `name = [ ... ]` and returns its quoted strings. Plain string scanning, not a RegExp built from the name.
function parseStarlarkStringList(source, name) {
    const skipSpaces = (at) => {
        let i = at;
        while (i < source.length && /\s/.test(source[i]))
            i += 1;
        return i;
    };
    let from = 0;
    for (;;) {
        const at = source.indexOf(name, from);
        if (at === -1)
            return undefined;
        let i = skipSpaces(at + name.length);
        if (source[i] === "=") {
            i = skipSpaces(i + 1);
            if (source[i] === "[") {
                const end = source.indexOf("]", i + 1);
                if (end === -1)
                    return undefined;
                return [...source.slice(i + 1, end).matchAll(/"([^"]+)"|'([^']+)'/g)].map((x) => x[1] ?? x[2] ?? "");
            }
        }
        from = at + name.length;
    }
}
function tiltfileAlwaysEnabledInfra(projectRoot) {
    const path = join(projectRoot, ".tdk", ".tdk-out", "Tiltfile");
    const text = readTextIfExists(path);
    if (!text)
        return undefined;
    return parseStarlarkStringList(text, "ALWAYS_ENABLED_INFRA");
}
function specMasterHasDatabaseManagement(projectRoot) {
    const path = join(projectRoot, ".tdk", ".tdk-out", "spec.master");
    const text = readTextIfExists(path);
    if (text === undefined)
        return undefined;
    // PRE_ALPHA/DEFAULTS style: "database-management": True
    return /"database-management"\s*:\s*True/.test(text);
}
function generatedDefaultFocusEnablesDatabaseManagement(projectRoot) {
    const output = join(projectRoot, ".tdk", ".tdk-out");
    const tiltfile = readTextIfExists(join(output, "Tiltfile"));
    const spec = readTextIfExists(join(output, "spec.master"));
    const config = readTextIfExists(join(output, "tdk-cli-ext", "discovery", "config.star"));
    const profiles = readTextIfExists(join(output, "tdk-cli-ext", "engine", "topologies", "tilt", "config", "profiles.star"));
    if (!tiltfile || !spec || !config || !profiles)
        return false;
    const preAlpha = spec.match(/PRE_ALPHA_RESOURCES\s*=\s*\{([^}]*)\}/)?.[1];
    const coreInfra = parseStarlarkStringList(config, "CORE_INFRA");
    return (/FOCUS_MODE\s*,\s*FOCUS_ENABLED_ALL\s*,\s*FOCUS_ENABLED_RESOURCES\s*=\s*Config\.apply_focus\(cfg\)/.test(tiltfile) &&
        /if FOCUS_MODE and FOCUS_ENABLED_ALL\s*:/.test(tiltfile) &&
        /"[^"]+"\s*:\s*True|'[^']+'\s*:\s*True/.test(preAlpha ?? "") &&
        (coreInfra?.includes("postgres") ?? false) &&
        /["']postgres["']\s*:\s*["']database-management["']/.test(config) &&
        /for infra in CORE_INFRA_EXPORT\s*:/.test(profiles) &&
        /needed\[INFRA_STACK_MAP_EXPORT\[infra\]\]\s*=\s*True/.test(profiles));
}
function projectJsonFeatureOn(projectRoot) {
    const parsed = readProjectJson(projectRoot);
    if (!parsed)
        return false;
    const phases = (parsed.phases ?? {});
    for (const phase of PHASE_KEYS) {
        const stacks = phases[phase]?.enabledStacks;
        if (Array.isArray(stacks) && stacks.includes(DATABASE_MANAGEMENT_FEATURE)) {
            return true;
        }
    }
    const alwaysEnabled = parsed.always_enabled_infra ?? DEFAULT_ALWAYS_ENABLED_INFRA;
    return Array.isArray(alwaysEnabled) && alwaysEnabled.includes(DATABASE_MANAGEMENT_FEATURE);
}
/**
 * True when database-management is on for this project from project.json
 * **or** the generated Tiltfile/spec.master when those files exist.
 */
export function databaseManagementEnabled(projectRoot) {
    if (projectJsonFeatureOn(projectRoot))
        return true;
    const fromTilt = tiltfileAlwaysEnabledInfra(projectRoot);
    if (Array.isArray(fromTilt) && fromTilt.includes(DATABASE_MANAGEMENT_FEATURE))
        return true;
    if (specMasterHasDatabaseManagement(projectRoot) === true)
        return true;
    return false;
}
/** Known names for unknown-dependsOn detection: discovered services/stacks + project stacks/infra. */
function knownDependsonNames(projectRoot, resources) {
    const known = new Set();
    for (const name of POSTGRES_DEPENDENCY_NAMES)
        known.add(name);
    for (const resource of resources) {
        known.add(resource.name);
        if (resource.stack)
            known.add(resource.stack);
    }
    const parsed = readProjectJson(projectRoot);
    if (parsed) {
        const phases = (parsed.phases ?? {});
        for (const phase of PHASE_KEYS) {
            const stacks = phases[phase]?.enabledStacks;
            if (Array.isArray(stacks)) {
                for (const stack of stacks)
                    known.add(stack);
            }
        }
        const alwaysEnabled = parsed.always_enabled_infra ?? DEFAULT_ALWAYS_ENABLED_INFRA;
        if (Array.isArray(alwaysEnabled)) {
            for (const entry of alwaysEnabled)
                known.add(entry);
        }
    }
    const fromTilt = tiltfileAlwaysEnabledInfra(projectRoot);
    if (Array.isArray(fromTilt)) {
        for (const entry of fromTilt)
            known.add(entry);
    }
    return known;
}
/**
 * Evaluate whether shared platform Postgres will start for this project.
 *
 * willStart = featureOn OR any inspected project resource depends on either name.
 * Resource set is project scope (discoverResourcesFromRoot), NOT tdk up --only.
 *
 * Also reports focusWouldEnableDatabaseManagement so doctor/verify can warn that
 * default focus expands CORE_INFRA → database-management even when project.json
 * says the feature is off (the 7.1 gap).
 */
export function evaluateSharedPlatformPostgres(projectRoot, resources = discoverResourcesFromRoot(projectRoot)) {
    const featureOnFromProjectJson = projectJsonFeatureOn(projectRoot);
    const fromTilt = tiltfileAlwaysEnabledInfra(projectRoot);
    const featureOnFromTiltfile = Array.isArray(fromTilt) && fromTilt.includes(DATABASE_MANAGEMENT_FEATURE);
    const featureOnFromSpecMaster = specMasterHasDatabaseManagement(projectRoot) === true;
    const featureOn = featureOnFromProjectJson || featureOnFromTiltfile || featureOnFromSpecMaster;
    const focusWouldEnableDatabaseManagement = !featureOnFromProjectJson && generatedDefaultFocusEnablesDatabaseManagement(projectRoot);
    const known = knownDependsonNames(projectRoot, resources);
    const dependsOnUsers = [];
    const unknownDependsOnNames = [];
    for (const resource of resources) {
        const deps = resource.config?.dependsOn ?? [];
        let usesSharedPostgres = false;
        for (const dep of deps) {
            if (isSharedPlatformPostgresDependency(dep)) {
                usesSharedPostgres = true;
                continue;
            }
            if (!known.has(dep)) {
                unknownDependsOnNames.push({ resource: resource.name, name: dep });
            }
        }
        if (usesSharedPostgres) {
            dependsOnUsers.push(resource.name);
        }
    }
    const willStart = featureOn || dependsOnUsers.length > 0;
    const reason = featureOn
        ? "feature"
        : dependsOnUsers.length > 0
            ? "dependsOn"
            : "none";
    return {
        featureOn,
        featureOnFromProjectJson,
        featureOnFromTiltfile,
        featureOnFromSpecMaster,
        focusWouldEnableDatabaseManagement,
        dependsOnUsers,
        willStart,
        reason,
        unknownDependsOnNames,
    };
}
/** Human-readable will-start / will-not-start sentence shared by doctor + verify. */
export function sharedPlatformPostgresMessage(evaluation) {
    const projectScopeNote = " (project resource set; tdk up may select a subset and not start Postgres)";
    if (!evaluation.willStart) {
        const focusNote = evaluation.focusWouldEnableDatabaseManagement
            ? " Note: default focus/CORE_INFRA expansion would enable database-management on a typical tdk up even when project.json lists it off."
            : "";
        return `Shared platform Postgres will not start for this project.json/generated Tiltfile state (no database-management feature, no selected dependsOn).${focusNote}`;
    }
    const why = evaluation.reason === "feature"
        ? `the database-management feature is enabled${evaluation.featureOnFromTiltfile || evaluation.featureOnFromSpecMaster
            ? " (generated Tiltfile/spec.master)"
            : ""}`
        : `resource(s) ${evaluation.dependsOnUsers.join(", ")} depend on postgres/database-management`;
    return `Shared platform Postgres will start because ${why}${projectScopeNote}`;
}
