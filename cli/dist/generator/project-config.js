// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * Reading and validating `.flisk/project.json`, plus the one-question
 * orchestration check built on it (`isTiltfileOrchestration`).
 *
 * This is a leaf module on purpose: the runtime commands that only need to
 * know "does this project wrap its own Tiltfile?" (`restart`, `doctor`)
 * import from here instead of the 1,500-line generation engine in
 * `template-engine.ts`, which re-exports these symbols for its other callers.
 * Keep it that way: nothing in here may import the generator.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { PROJECT_JSON } from "../utils/constants.js";
import { FliskError } from "../utils/errors.js";
const PHASE_NAMES = ["pre_alpha", "alpha", "beta", "out_of_scope"];
/** The first phase of `value` that does not have the shape of the phase table, named by field path. */
function phaseShapeProblem(value, fieldName, prefix) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {
            field: prefix,
            expected: "an object with pre_alpha, alpha, beta and out_of_scope",
            got: value,
        };
    }
    const phases = value;
    for (const phaseName of PHASE_NAMES) {
        const phase = phases[phaseName];
        if (!phase || typeof phase !== "object" || Array.isArray(phase)) {
            return { field: `${prefix}.${phaseName}`, expected: "an object", got: phase };
        }
        const stacks = phase[fieldName];
        if (!Array.isArray(stacks)) {
            return { field: `${prefix}.${phaseName}.${fieldName}`, expected: "an array", got: stacks };
        }
    }
    return null;
}
/** `capabilities` in project.json: an object whose every value is a boolean. */
function isCapabilityMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
    return Object.values(value).every((flag) => typeof flag === "boolean");
}
/** How a rejected project.json value is named in the error: `"services"`, `an array`, `null`. */
function describeJsonValue(value) {
    if (value === null)
        return "null";
    if (Array.isArray(value))
        return "an array";
    if (typeof value === "object")
        return "an object";
    if (typeof value === "string")
        return JSON.stringify(value);
    return String(value);
}
export function normalizeProjectConfig(value) {
    const fail = (field, expected, got) => ({
        ok: false,
        problem: { field, expected, got },
    });
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return fail("", "an object", value);
    }
    // Safe to assert as Record after null and object type checks
    const config = value;
    if (typeof config.version !== "string") {
        return fail("version", "a string", config.version);
    }
    if (!config.project || typeof config.project !== "object" || Array.isArray(config.project)) {
        return fail("project", "an object", config.project);
    }
    const project = config.project;
    if (typeof project.name !== "string") {
        return fail("project.name", "a string", project.name);
    }
    // Reading an existing project.json accepts every name Docker Compose accepts for a project (lowercase letters, numbers,
    // hyphens and underscores, starting with a letter or number): `flisk import` keeps a Compose project's own name such as
    // `pl_mail` so its volume names stay stable. The stricter kebab-case rule applies where Flisk derives or asks for a name.
    if (project.name.length > 64 || !/^[a-z0-9][a-z0-9_-]*$/.test(project.name)) {
        return fail("project.name", "a Docker-compatible name (lowercase letters, numbers, hyphens and underscores, starting with a letter or number)", project.name);
    }
    if (typeof project.version !== "string") {
        return fail("project.version", "a string", project.version);
    }
    let phases = null;
    const modernProblem = phaseShapeProblem(config.phases, "enabledStacks", "phases");
    const legacyProblem = modernProblem
        ? phaseShapeProblem(config.stacks, "services", "stacks")
        : null;
    if (!modernProblem) {
        phases = config.phases;
    }
    else if (!legacyProblem) {
        const legacyStacks = config.stacks;
        phases = {
            pre_alpha: {
                name: legacyStacks.pre_alpha.name,
                description: legacyStacks.pre_alpha.description,
                enabledStacks: legacyStacks.pre_alpha.services,
            },
            alpha: {
                name: legacyStacks.alpha.name,
                description: legacyStacks.alpha.description,
                enabledStacks: legacyStacks.alpha.services,
            },
            beta: {
                name: legacyStacks.beta.name,
                description: legacyStacks.beta.description,
                enabledStacks: legacyStacks.beta.services,
            },
            out_of_scope: {
                name: legacyStacks.out_of_scope.name,
                description: legacyStacks.out_of_scope.description,
                enabledStacks: legacyStacks.out_of_scope.services,
            },
        };
    }
    else {
        // A file that has neither shape is a `phases` problem unless it is written in the legacy `stacks` form.
        const problem = config.stacks !== undefined && config.phases === undefined ? legacyProblem : modernProblem;
        return fail(problem.field, problem.expected, problem.got);
    }
    if (!config.optional_infra ||
        typeof config.optional_infra !== "object" ||
        Array.isArray(config.optional_infra)) {
        return fail("optional_infra", "an object with boolean flags", config.optional_infra);
    }
    const optionalInfra = config.optional_infra;
    for (const flag of ["monitoring", "elk", "debezium", "golden_image", "verdaccio"]) {
        if (typeof optionalInfra[flag] !== "boolean") {
            return fail(`optional_infra.${flag}`, "a boolean", optionalInfra[flag]);
        }
    }
    if (!config.discovery ||
        typeof config.discovery !== "object" ||
        Array.isArray(config.discovery)) {
        return fail("discovery", "an object", config.discovery);
    }
    const discovery = config.discovery;
    if (!Array.isArray(discovery.paths)) {
        return fail("discovery.paths", "an array", discovery.paths);
    }
    // A capability is a boolean: `"gateway": "false"` would not match `=== false` and leave Traefik on, so refuse the file.
    if (config.capabilities !== undefined && !isCapabilityMap(config.capabilities)) {
        return fail("capabilities", "an object of booleans", config.capabilities);
    }
    let repos;
    if (config.repos !== undefined) {
        if (!Array.isArray(config.repos)) {
            return fail("repos", "an array", config.repos);
        }
        repos = [];
        for (const [index, item] of config.repos.entries()) {
            const prefix = `repos[${index}]`;
            if (!item || typeof item !== "object" || Array.isArray(item)) {
                return fail(prefix, "an object with url and dir", item);
            }
            const repo = item;
            if (typeof repo.url !== "string" || !repo.url.trim()) {
                return fail(`${prefix}.url`, "a non-empty string", repo.url);
            }
            if (typeof repo.dir !== "string" || !repo.dir.trim()) {
                return fail(`${prefix}.dir`, "a non-empty string", repo.dir);
            }
            if (repo.branch !== undefined && typeof repo.branch !== "string") {
                return fail(`${prefix}.branch`, "a string", repo.branch);
            }
            repos.push({
                url: repo.url.trim(),
                dir: repo.dir.trim(),
                ...(typeof repo.branch === "string" && repo.branch.trim()
                    ? { branch: repo.branch.trim() }
                    : {}),
            });
        }
    }
    const capabilities = config.capabilities;
    return {
        ok: true,
        config: {
            version: config.version,
            project: config.project,
            phases,
            always_enabled_infra: config.always_enabled_infra,
            optional_infra: config.optional_infra,
            discovery: config.discovery,
            overrides: config.overrides,
            orchestration: config.orchestration,
            ...(capabilities ? { capabilities } : {}),
            ...(repos ? { repos } : {}),
        },
    };
}
/** The project has no .flisk/project.json yet, as opposed to one that exists but is unreadable or invalid. */
export class ProjectConfigNotFoundError extends FliskError {
}
/** The project.json path as the user sees it, for messages that name a field of it. */
const PROJECT_JSON_DISPLAY = `.flisk/${PROJECT_JSON}`;
/**
 * Reads, parses, and normalizes `.flisk/project.json` from the given project root.
 *
 * The file is read directly instead of being existence-checked first: `fs.existsSync` swallows
 * filesystem errors and reports an inaccessible config as missing, which hides the real reason.
 * Only a missing file (`ENOENT`) means "not found"; every other read failure keeps its reason.
 *
 * @param projectRoot - Root directory of the Flisk project.
 * @returns The validated and normalized {@link ProjectConfig}.
 */
export function readProjectConfig(projectRoot) {
    const projectJsonPath = path.join(projectRoot, ".flisk", PROJECT_JSON);
    // A project.json that exists but cannot be read or parsed stays a plain Error: `flisk config verify --json` documents
    // it as a structured INTERNAL error with exit code 2 (docs/reference/machine-readable-cli.md). A field with the
    // wrong type is the user's own file, so it is a FliskError that names the field and exits 1.
    let jsonContent;
    try {
        jsonContent = fs.readFileSync(projectJsonPath, "utf-8");
    }
    catch (error) {
        if (error?.code === "ENOENT") {
            throw new ProjectConfigNotFoundError(`Project config not found: ${projectJsonPath}. Run 'flisk project --yes' first.`, ["flisk project --yes"]);
        }
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not read project.json at ${projectJsonPath}: ${reason}`);
    }
    let parsed;
    try {
        parsed = JSON.parse(jsonContent);
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not parse project.json at ${projectJsonPath}: ${reason}`);
    }
    const normalized = normalizeProjectConfig(parsed);
    if (!normalized.ok) {
        const { field, expected, got } = normalized.problem;
        const name = field ? `${PROJECT_JSON_DISPLAY}.${field}` : PROJECT_JSON_DISPLAY;
        throw new FliskError(`${name}: expected ${expected}, got ${describeJsonValue(got)}`, [
            `Fix ${name}, then run 'flisk config verify'`,
        ]);
    }
    return normalized.config;
}
/**
 * True when .flisk/project.json makes the project's own Tiltfile its orchestration source (`flisk import tiltfile`), so
 * `flisk up` runs Tilt with the wrapper. False when there is no readable project.json.
 */
export function isTiltfileOrchestration(projectRoot) {
    try {
        return readProjectConfig(projectRoot).orchestration?.source === "tiltfile";
    }
    catch {
        return false;
    }
}
