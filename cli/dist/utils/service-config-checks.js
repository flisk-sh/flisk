// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { relative } from "node:path";
import chalk from "chalk";
import { checkDuplicateResourceNames } from "./doctor-wiring.js";
import { formatCount } from "./formatting.js";
import { findProjectRoot } from "./paths.js";
import { SERVICE_MANIFEST_SCHEMA_VERSION } from "./service-manifest.js";
import { discoverResourcesFromRoot } from "./services.js";
function filePath(projectRoot, resource) {
    return relative(projectRoot, resource.configPath) || resource.configPath;
}
/** The dependsOn names a service declares: none when absent, null when it is not an array of strings. */
function declaredDependsOn(resource) {
    const value = resource.config?.dependsOn;
    if (value === undefined)
        return [];
    if (Array.isArray(value) && value.every((entry) => typeof entry === "string"))
        return value;
    return null;
}
/** Each cycle once, as service names starting from the alphabetically first, ending where it started. */
function findDependencyCycles(resources) {
    const known = new Set(resources.map((r) => r.name));
    const edges = new Map(resources.map((r) => [r.name, (declaredDependsOn(r) ?? []).filter((dep) => known.has(dep))]));
    const cycles = new Map();
    const state = new Map();
    const stack = [];
    const visit = (name) => {
        state.set(name, "visiting");
        stack.push(name);
        for (const dep of edges.get(name) ?? []) {
            if (state.get(dep) === "visiting") {
                const loop = stack.slice(stack.indexOf(dep));
                const start = loop.indexOf([...loop].sort()[0] ?? dep);
                const ordered = [...loop.slice(start), ...loop.slice(0, start)];
                cycles.set(ordered.join(">"), [...ordered, ordered[0] ?? dep]);
            }
            else if (!state.has(dep)) {
                visit(dep);
            }
        }
        stack.pop();
        state.set(name, "done");
    };
    for (const name of [...edges.keys()].sort()) {
        if (!state.has(name))
            visit(name);
    }
    return [...cycles.values()];
}
/** A dependsOn that is not a list of service names cannot be followed, so say so instead of failing later. */
export function checkDependsOnShape(projectRoot = findProjectRoot() ?? process.cwd(), resources = discoverResourcesFromRoot(projectRoot)) {
    const problems = resources.flatMap((resource) => declaredDependsOn(resource) === null
        ? [
            `${filePath(projectRoot, resource)} dependsOn ${JSON.stringify(resource.config?.dependsOn)}: expected an array of service names`,
        ]
        : []);
    if (problems.length === 0) {
        return {
            name: "dependsOn",
            didPass: true,
            message: "Every dependsOn is a list of service names",
        };
    }
    return {
        name: "dependsOn",
        didPass: false,
        message: `${formatCount(problems.length, "invalid dependsOn", "invalid dependsOn")}:\n    ${problems.join("\n    ")}`,
        fix: 'Write "dependsOn" as an array of service names, for example ["postgres", "api"]',
    };
}
/** Services that wait on each other can never both start. A dependsOn name that is not a service is left to the unknown-name check. */
export function checkCircularDependencies(projectRoot = findProjectRoot() ?? process.cwd(), resources = discoverResourcesFromRoot(projectRoot)) {
    const byName = new Map(resources.map((r) => [r.name, r]));
    const cycles = findDependencyCycles(resources);
    if (cycles.length === 0) {
        return {
            name: "Circular dependencies",
            didPass: true,
            message: "No service depends on itself through dependsOn",
        };
    }
    const lines = cycles.map((cycle) => {
        const first = byName.get(cycle[0] ?? "");
        const next = cycle[1] ?? "";
        return `${first ? filePath(projectRoot, first) : cycle[0]} dependsOn "${next}": circular dependency ${cycle.join(" -> ")}`;
    });
    return {
        name: "Circular dependencies",
        didPass: false,
        message: `${cycles.length} ${cycles.length === 1 ? "circular dependency" : "circular dependencies"}:\n    ${lines.join("\n    ")}`,
        fix: 'Remove one "dependsOn" entry in each cycle so the services no longer wait on each other, or move what they share into a third service',
    };
}
/** A port outside 1-65535 can never be bound, and `tdk up` would otherwise find out only when Docker fails. */
export function checkServicePorts(projectRoot = findProjectRoot() ?? process.cwd(), resources = discoverResourcesFromRoot(projectRoot)) {
    const problems = resources.flatMap((resource) => {
        const port = resource.config?.port;
        if (port === undefined)
            return [];
        if (typeof port === "number" && Number.isInteger(port) && port >= 1 && port <= 65535)
            return [];
        return [
            `${filePath(projectRoot, resource)} port ${JSON.stringify(port)}: not an integer from 1 to 65535`,
        ];
    });
    if (problems.length === 0) {
        return { name: "Service ports", didPass: true, message: "Every declared port is valid" };
    }
    return {
        name: "Service ports",
        didPass: false,
        message: `${formatCount(problems.length, "invalid port")}:\n    ${problems.join("\n    ")}`,
        fix: 'Set "port" to the port the service listens on, an integer from 1 to 65535',
    };
}
/**
 * A service.json with no schemaVersion is how every project began, so this is a warning: it keeps working, and only
 * `tdk config migrate` writes the field. A version this tdk does not know is reported the same way, with a different fix.
 */
export function checkSchemaVersions(projectRoot = findProjectRoot() ?? process.cwd(), strict = false, resources = discoverResourcesFromRoot(projectRoot)) {
    const missing = [];
    const unsupported = [];
    for (const resource of resources) {
        const version = resource.config?.schemaVersion;
        if (version === SERVICE_MANIFEST_SCHEMA_VERSION)
            continue;
        const file = filePath(projectRoot, resource);
        if (version === undefined)
            missing.push(`${file} schemaVersion: missing`);
        else
            unsupported.push(`${file} schemaVersion ${JSON.stringify(version)}: this tdk supports ${SERVICE_MANIFEST_SCHEMA_VERSION}`);
    }
    if (missing.length === 0 && unsupported.length === 0) {
        return {
            name: "schemaVersion",
            didPass: true,
            message: "Every service.json has a supported schemaVersion",
        };
    }
    const fixes = [
        ...(missing.length > 0 ? ["Run `tdk config migrate` to add the missing schemaVersion"] : []),
        ...(unsupported.length > 0
            ? ["A version this tdk does not support cannot be migrated: upgrade tdk"]
            : []),
    ];
    return {
        name: "schemaVersion",
        didPass: false,
        isWarning: !strict,
        message: `${formatCount(missing.length + unsupported.length, "service.json file")} without a supported schemaVersion:\n    ${[...missing, ...unsupported].join("\n    ")}`,
        fix: fixes.join(". "),
    };
}
/** Prints the schemaVersion warning once. It never stops anything: the project keeps working as it is. */
export function warnSchemaVersions(projectRoot, resources) {
    const check = checkSchemaVersions(projectRoot, false, resources);
    if (check.didPass)
        return;
    console.warn(chalk.yellow(`⚠ ${check.message}`));
    if (check.fix)
        console.warn(chalk.gray(`  ${check.fix}`));
}
/**
 * Runs before anything starts (also under --dry-run, like the drift gate): duplicate service names, circular
 * dependsOn and invalid ports exit with 1 and say which file, which field, and how to fix it.
 */
export function enforceServiceConfigGate(projectRoot, options = {}, exit = process.exit) {
    const resources = options.resources ?? discoverResourcesFromRoot(projectRoot);
    const failed = [
        checkDuplicateResourceNames(projectRoot, resources),
        checkDependsOnShape(projectRoot, resources),
        checkCircularDependencies(projectRoot, resources),
        checkServicePorts(projectRoot, resources),
    ].filter((check) => !check.didPass);
    if (failed.length === 0)
        return;
    const text = failed
        .map((check) => `${check.message}${check.fix ? `\nFix: ${check.fix}` : ""}`)
        .join("\n");
    options.onInvalid?.(text);
    for (const check of failed) {
        console.error(chalk.red(`✗ ${check.message}`));
        if (check.fix)
            console.error(chalk.gray(`  Fix: ${check.fix}`));
    }
    exit(1);
}
