// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { FRONTEND_FRAMEWORK_IDS } from "./frontend-framework-ids.js";
import { declaresCommand, validateNativeServiceFields } from "./native-service.js";
import { validateSmoke } from "./smoke.js";
export const SERVICE_MANIFEST_SCHEMA_VERSION = 1;
export const SERVICE_MANIFEST_SCHEMA_URL = "https://flisk.sh/schema.service.json";
/**
 * Fields that are still read, or still tolerated, but should not be used. The warning says what replaces each one. `jwtSecret` is
 * ignored outright: a secret must not be committed (see docs/environment.md).
 */
const DEPRECATED_FIELDS = {
    dependencies: "deprecated, use dependsOn (still read for now)",
    envVars: "deprecated, use params (still read when params is absent)",
    jwtSecret: "ignored. A secret must not be committed: remove it and set JWT_SECRET in the project .env",
};
const KNOWN_SERVICE_FIELDS = new Set([
    "$schema",
    "agent",
    "apiBasePath",
    "apiPath",
    "appName",
    "appType",
    "backendName",
    "basePath",
    "build",
    "buildContext",
    "command",
    "databaseName",
    "dependencies",
    "dev",
    "dependsOn",
    "dockerfile",
    "enabled",
    "env",
    "exposeViaProxy",
    "featuresEnabled",
    "framework",
    "healthCheck",
    "healthCheckPath",
    "image",
    "language",
    "name",
    "nats",
    "params",
    "playwright",
    "port",
    "replicas",
    "restart",
    "runtime",
    "sablier",
    "schemaVersion",
    "secrets",
    "smoke",
    "stack",
    "syncs",
    "traefik",
    "type",
]);
/**
 * String fields written into the generated Docker Compose, Traefik and NATS config as they are. A newline or YAML syntax in one of
 * them adds keys to the generated service (GHSA-phgf-pww4-7jxc), so each must match its pattern. Empty values are treated as unset.
 * `tilt up` reads service.json without this CLI, so engine/topologies/tilt/manifest/parser.star enforces the same rules.
 */
const GENERATED_STRING_FIELDS = [
    { path: ["healthCheckPath"], pattern: /^\/[a-z0-9/-]*$/, expected: "a path such as /health" },
    { path: ["healthCheck", "path"], pattern: /^\/[a-z0-9/-]*$/, expected: "a path such as /health" },
    { path: ["apiPath"], pattern: /^\/[A-Za-z0-9._~/-]*$/, expected: "a path such as /api/v1" },
    { path: ["apiBasePath"], pattern: /^\/[A-Za-z0-9._~/-]*$/, expected: "a path such as /api/v1" },
    {
        path: ["traefik", "host"],
        pattern: /^[A-Za-z0-9.-]+$/,
        expected: "a hostname such as shop.backend.myproject.local",
    },
    {
        path: ["traefik", "pathPrefix"],
        pattern: /^\/[a-z0-9/-]*$/,
        expected: "a path such as /api/v1/shop-management",
    },
    {
        path: ["traefik", "healthCheck"],
        pattern: /^\/[a-z0-9/-]*$/,
        expected: "a path such as /health",
    },
    {
        path: ["nats", "queueGroup"],
        pattern: /^[A-Za-z0-9_.-]+$/,
        expected: "letters, digits, '_', '.' or '-'",
    },
    { path: ["databaseName"], pattern: /^[A-Za-z0-9_-]+$/, expected: "letters, digits, '_' or '-'" },
    { path: ["stack"], pattern: /^[A-Za-z0-9_-]+$/, expected: "letters, digits, '_' or '-'" },
    {
        path: ["image"],
        pattern: /^[A-Za-z0-9._/:@-]+$/,
        expected: "an image reference such as ghcr.io/acme/app:1.0",
    },
    { path: ["basePath"], pattern: /^\/[a-z0-9/-]*$/, expected: "a path such as /storefront" },
];
/**
 * Errors for generated-output fields whose values could change the generated YAML. The value itself is not echoed, because it may
 * contain the newline that makes it dangerous.
 */
export function validateGeneratedStringFields(manifest, displayPath) {
    const errors = [];
    const reportedFields = new Set();
    for (const { path, pattern, expected } of GENERATED_STRING_FIELDS) {
        let value = manifest;
        for (const key of path) {
            value =
                value && typeof value === "object" && !Array.isArray(value)
                    ? value[key]
                    : undefined;
        }
        if (value === undefined || value === null || value === "")
            continue;
        const field = `${displayPath}.${path.join(".")}`;
        if (typeof value !== "string" || !pattern.test(value))
            reportedFields.add(field);
        if (typeof value !== "string") {
            errors.push(`${field}: expected a string`);
        }
        else if (!pattern.test(value)) {
            errors.push(`${field}: must be ${expected} (no spaces, line breaks or YAML syntax)`);
        }
    }
    for (const [field, message] of lineBreakErrors(manifest, displayPath)) {
        if (!reportedFields.has(field))
            errors.push(`${field}: ${message}`);
    }
    return errors;
}
/** Line breaks (including the Unicode ones YAML 1.1 honours) and other control characters. */
function hasLineBreakOrControl(text) {
    for (let index = 0; index < text.length; index++) {
        const code = text.charCodeAt(index);
        if (code < 0x20 || code === 0x7f || code === 0x85 || code === 0x2028 || code === 0x2029) {
            return true;
        }
    }
    return false;
}
/**
 * Many more service.json values than GENERATED_STRING_FIELDS reach the generated YAML (port, appName, dockerfile, buildContext,
 * basePath, envVars, ...). A key can only be added through a line break, so no string key or value may contain one. `smoke` is
 * skipped: the CLI sends it over HTTP and it is never written into generated config.
 */
function lineBreakErrors(manifest, displayPath) {
    const errors = [];
    const pending = Object.entries(manifest)
        .filter(([key]) => key !== "smoke")
        .map(([key, value]) => [value, `${displayPath}.${key}`]);
    for (const key of Object.keys(manifest)) {
        if (hasLineBreakOrControl(key))
            errors.push([displayPath, "a key contains a line break"]);
    }
    while (pending.length > 0) {
        const [value, field] = pending.pop();
        if (typeof value === "string") {
            if (hasLineBreakOrControl(value)) {
                errors.push([field, "must not contain line breaks or control characters"]);
            }
        }
        else if (Array.isArray(value)) {
            for (const [index, item] of value.entries())
                pending.push([item, `${field}[${index}]`]);
        }
        else if (value && typeof value === "object") {
            for (const [key, item] of Object.entries(value)) {
                if (hasLineBreakOrControl(key)) {
                    errors.push([field, "a key contains a line break"]);
                }
                else {
                    pending.push([item, `${field}.${key}`]);
                }
            }
        }
    }
    return errors.sort(([a], [b]) => a.localeCompare(b));
}
/**
 * `appName` and `stack` end up in a Docker image name (`<project>_<stack>_<appName>:dev`), a Compose service and a container
 * name. Docker refuses a repository name with an uppercase letter, a space or a leading, trailing or doubled separator, and
 * Tilt then fails inside `docker_compose` after `flisk up` said all was well. 63 is the DNS label limit the Traefik host uses.
 */
const DOCKER_NAME = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;
/** Tilt labels every service `app.<appName>`, and a label is at most 63 bytes; a stack has no such prefix. */
const DOCKER_NAME_MAX = { appName: 59, stack: 63 };
export function isDockerSafeName(value, max = DOCKER_NAME_MAX.stack) {
    return typeof value === "string" && value.length <= max && DOCKER_NAME.test(value);
}
/** Errors for an `appName` or `stack` that Docker cannot name an image after. A `command` service never reaches Docker. */
export function dockerNameErrors(manifest, displayPath) {
    if (declaresCommand(manifest))
        return [];
    const errors = [];
    for (const field of ["appName", "stack"]) {
        const value = manifest[field];
        if (typeof value !== "string" || isDockerSafeName(value, DOCKER_NAME_MAX[field]))
            continue;
        // The value is not echoed: it may hold the line break that makes a service.json dangerous (see lineBreakErrors).
        errors.push(`${displayPath}.${field}: cannot be a Docker image name; use lowercase letters and digits joined by "-", "_" or "." (at most ${DOCKER_NAME_MAX[field]} characters)`);
    }
    return errors;
}
/**
 * The types the engine reads these fields as (runtime/engine/schemas/service-schema.json). A value of another type is not
 * ignored: the Tiltfile calls `.get` on an object field or `+` on a string field and stops with a Starlark error
 * ("string has no .get field or method"), after `flisk up` has already said yes. `null` reads as unset, as it does there.
 * Only fields whose shape is unambiguous are listed: `syncs`, `secrets`, `playwright`, `runtime` and `dev` are written in forms the
 * published schema does not describe, so they stay as they are. Fields checked elsewhere (appName, appType, stack, port,
 * schemaVersion, dependsOn, smoke, healthCheckPath, the command-service fields) are not repeated.
 */
const FIELD_KINDS = {
    apiBasePath: "string",
    backendName: "string",
    buildContext: "string",
    databaseName: "string",
    dockerfile: "string",
    framework: "string",
    image: "string",
    language: "string",
    restart: "string",
    enabled: "boolean",
    exposeViaProxy: "boolean",
    agent: "object",
    build: "object",
    nats: "object",
    params: "object",
    sablier: "object",
    traefik: "object",
    featuresEnabled: "string[]",
};
const REPLICAS_MAX = 10;
const DATABASE_NAME_MAX = 63;
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
/**
 * An absolute path or a Windows drive. Build paths are relative to the service directory (the loader joins them to it), so an
 * absolute one can never resolve. `..` is allowed on purpose: a service.json inside the project may build from a source tree
 * outside it (docs/layout.md, docs/byo.md), and `flisk import` writes exactly that for a Compose service whose Dockerfile stays
 * where it was.
 */
export function isAbsoluteBuildPath(value) {
    return /^([\\/]|[A-Za-z]:)/.test(value);
}
/** Errors for a field of the wrong type, an enum value that does not exist, an escaping path, or a conflicting source. */
export function fieldTypeErrors(manifest, displayPath) {
    if (declaresCommand(manifest))
        return [];
    const errors = [];
    const bad = (field, expected) => {
        errors.push(`${displayPath}.${field}: expected ${expected}`);
    };
    for (const [field, kind] of Object.entries(FIELD_KINDS)) {
        const value = manifest[field];
        if (value === undefined || value === null)
            continue;
        if (kind === "string" && typeof value !== "string")
            bad(field, "a string");
        else if (kind === "boolean" && typeof value !== "boolean")
            bad(field, "true or false");
        else if (kind === "object" && !isPlainObject(value))
            bad(field, "an object");
        else if (kind === "string[]" &&
            !(Array.isArray(value) && value.every((entry) => typeof entry === "string"))) {
            bad(field, "an array of strings");
        }
    }
    const replicas = manifest.replicas;
    if (replicas !== undefined && replicas !== null) {
        if (typeof replicas !== "number" ||
            !Number.isInteger(replicas) ||
            replicas < 1 ||
            replicas > REPLICAS_MAX) {
            bad("replicas", `an integer from 1 to ${REPLICAS_MAX}`);
        }
    }
    if (typeof manifest.databaseName === "string" &&
        manifest.databaseName.length > DATABASE_NAME_MAX) {
        errors.push(`${displayPath}.databaseName: at most ${DATABASE_NAME_MAX} characters (a Postgres identifier)`);
    }
    if (manifest.appType === "frontend" &&
        typeof manifest.framework === "string" &&
        !FRONTEND_FRAMEWORK_IDS.includes(manifest.framework)) {
        bad("framework", `one of ${FRONTEND_FRAMEWORK_IDS.join(", ")}`);
    }
    if (manifest.appType === "frontend" && typeof replicas === "number" && replicas > 1) {
        // Compose is generated for one frontend container, so Tilt stops looking for "<name>-1" (backends scale; frontends do not).
        errors.push(`${displayPath}.replicas: a frontend runs as one container; replicas applies to backend services`);
    }
    if (typeof manifest.language === "string" && !/^[a-z][a-z0-9-]*$/.test(manifest.language)) {
        bad("language", "a lowercase id such as bun, python or go");
    }
    const build = isPlainObject(manifest.build) ? manifest.build : {};
    const dev = isPlainObject(manifest.dev) ? manifest.dev : {};
    const paths = [
        ["dockerfile", manifest.dockerfile],
        ["buildContext", manifest.buildContext],
        ["build.dockerfile", build.dockerfile],
        ["build.context", build.context],
        ...(Array.isArray(dev.watch)
            ? dev.watch.map((entry, i) => [`dev.watch[${i}]`, entry])
            : []),
    ];
    for (const [field, value] of paths) {
        if (typeof value === "string" && isAbsoluteBuildPath(value)) {
            errors.push(`${displayPath}.${field}: must be a path relative to the service directory (no leading "/" or drive)`);
        }
    }
    for (const field of ["dockerfile", "buildContext"]) {
        const nested = field === "dockerfile" ? build.dockerfile : build.context;
        if (nested !== undefined && nested !== null && typeof nested !== "string") {
            bad(`build.${field === "dockerfile" ? "dockerfile" : "context"}`, "a string");
        }
    }
    if (typeof dev.command !== "undefined" &&
        dev.command !== null &&
        typeof dev.command !== "string") {
        bad("dev.command", "a string");
    }
    if (typeof dev.watch !== "undefined" &&
        dev.watch !== null &&
        !(Array.isArray(dev.watch) && dev.watch.every((e) => typeof e === "string"))) {
        bad("dev.watch", "an array of strings");
    }
    if (typeof dev.liveReload !== "undefined" &&
        dev.liveReload !== null &&
        typeof dev.liveReload !== "boolean") {
        bad("dev.liveReload", "true or false");
    }
    if (typeof dev.testOnSave !== "undefined") {
        if (dev.testOnSave === null) {
            bad("dev.testOnSave", 'true or false, or an object such as { "enabled": true, "path": "tests" }');
        }
        else if (typeof dev.testOnSave === "boolean") {
            // boolean is valid
        }
        else if (isPlainObject(dev.testOnSave)) {
            const testOnSave = dev.testOnSave;
            for (const key of Object.keys(testOnSave)) {
                if (key !== "enabled" && key !== "path") {
                    errors.push(`${displayPath}.dev.testOnSave: unexpected key "${key}" (expected "enabled" or "path")`);
                }
            }
            if (typeof testOnSave.enabled !== "undefined" && typeof testOnSave.enabled !== "boolean") {
                bad("dev.testOnSave.enabled", "true or false");
            }
            if (typeof testOnSave.path !== "undefined" &&
                (typeof testOnSave.path !== "string" || !testOnSave.path.trim())) {
                bad("dev.testOnSave.path", "a non-empty string path such as 'tests'");
            }
            else if (typeof testOnSave.path === "string" && isAbsoluteBuildPath(testOnSave.path)) {
                errors.push(`${displayPath}.dev.testOnSave.path: must be a path relative to the service directory (no leading "/" or drive)`);
            }
        }
        else {
            bad("dev.testOnSave", 'true or false, or an object such as { "enabled": true, "path": "tests" }');
        }
    }
    if (typeof manifest.image === "string" &&
        manifest.image &&
        typeof manifest.dockerfile === "string" &&
        manifest.dockerfile) {
        errors.push(`${displayPath}: set "image" or "dockerfile", not both; a service runs from one source`);
    }
    return errors;
}
const SERVICE_ROUTE_PATH_FIELDS = ["apiPath", "basePath"];
export function getInvalidServiceRoutePathFields(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return [];
    const manifest = value;
    return SERVICE_ROUTE_PATH_FIELDS.filter((field) => field in manifest && typeof manifest[field] !== "string");
}
/**
 * A name in `secrets.required` / `secrets.optional` that `params` or `env` also sets to a literal: the literal reaches the
 * container, so the secret in `.env` is silently never used (an admin account created with "changeme").
 */
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** `secrets` must be { required?: string[], optional?: string[] } of environment variable names: the generator fails on anything else. */
export function secretsErrors(manifest, displayPath) {
    const secrets = manifest.secrets;
    if (secrets === undefined || secrets === null)
        return [];
    if (typeof secrets !== "object" || Array.isArray(secrets))
        return [`${displayPath}.secrets: expected an object like { "required": ["NAME"] }`];
    const errors = [];
    for (const kind of ["required", "optional"]) {
        const names = secrets[kind];
        if (names === undefined)
            continue;
        if (!Array.isArray(names)) {
            errors.push(`${displayPath}.secrets.${kind}: expected a list of environment variable names`);
            continue;
        }
        for (const name of names) {
            if (typeof name !== "string" || !ENV_NAME_PATTERN.test(name))
                errors.push(`${displayPath}.secrets.${kind}: ${JSON.stringify(name)} is not an environment variable name (letters, digits and underscores, not starting with a digit)`);
        }
    }
    return errors;
}
export function secretConflictWarnings(manifest, displayPath) {
    const secrets = manifest.secrets;
    if (!secrets || typeof secrets !== "object")
        return [];
    const declared = new Set();
    for (const kind of ["required", "optional"]) {
        const names = secrets[kind];
        if (Array.isArray(names))
            for (const name of names)
                if (typeof name === "string")
                    declared.add(name);
    }
    const warnings = [];
    for (const field of ["params", "env"]) {
        const values = manifest[field];
        if (!values || typeof values !== "object" || Array.isArray(values))
            continue;
        for (const name of Object.keys(values)) {
            if (declared.has(name))
                warnings.push(`${displayPath}.${field}.${name}: also listed in secrets, so this literal value is used and the secret from .env is ignored; remove one of them`);
        }
    }
    return warnings;
}
const HEALTH_CHECK_CONFIG_KEYS = new Set(["enabled", "interval", "timeout", "retries", "path"]);
/**
 * Validates the optional `healthCheck` field: boolean (e.g. false to disable) or an object
 * configuring enabled, interval, timeout, retries, and path.
 */
export function healthCheckErrors(manifest, displayPath) {
    const value = manifest.healthCheck;
    if (value === undefined || value === null)
        return [];
    if (typeof value === "boolean")
        return [];
    if (!isPlainObject(value)) {
        return [
            `${displayPath}.healthCheck: expected true or false, or an object such as { "enabled": true, "path": "/health" }`,
        ];
    }
    const errors = [];
    const hc = value;
    for (const key of Object.keys(hc)) {
        if (!HEALTH_CHECK_CONFIG_KEYS.has(key)) {
            errors.push(`${displayPath}.healthCheck: unexpected key "${key}" (expected "enabled", "interval", "timeout", "retries", or "path")`);
        }
    }
    if (hc.enabled !== undefined && typeof hc.enabled !== "boolean") {
        errors.push(`${displayPath}.healthCheck.enabled: expected true or false`);
    }
    if (hc.interval !== undefined) {
        if (typeof hc.interval !== "number" || !Number.isFinite(hc.interval) || hc.interval <= 0) {
            errors.push(`${displayPath}.healthCheck.interval: expected a positive number`);
        }
    }
    if (hc.timeout !== undefined) {
        if (typeof hc.timeout !== "number" || !Number.isFinite(hc.timeout) || hc.timeout <= 0) {
            errors.push(`${displayPath}.healthCheck.timeout: expected a positive number`);
        }
    }
    if (hc.retries !== undefined) {
        if (typeof hc.retries !== "number" || !Number.isInteger(hc.retries) || hc.retries < 0) {
            errors.push(`${displayPath}.healthCheck.retries: expected a non-negative integer`);
        }
    }
    if (hc.path !== undefined) {
        if (typeof hc.path !== "string") {
            errors.push(`${displayPath}.healthCheck.path: expected a string`);
        }
        else if (!/^\/[a-z0-9/-]*$/.test(hc.path)) {
            errors.push(`${displayPath}.healthCheck.path: must be a path such as /health (no spaces, line breaks or YAML syntax)`);
        }
    }
    return errors;
}
/** The `healthCheck` object of a manifest, or an empty one when it is a boolean or absent. */
function healthCheckObject(manifest) {
    return isPlainObject(manifest?.healthCheck)
        ? manifest.healthCheck
        : {};
}
/**
 * The one rule for turning health checks off: `healthCheck: false` or `healthCheck: { enabled: false }`.
 * Nothing else disables them: a service without a health path still gets its default readiness
 * signal (its port for a native `command` service, `/health` for a container).
 */
export function isHealthCheckDisabled(manifest) {
    const value = manifest?.healthCheck;
    return value === false || (isPlainObject(value) && value.enabled === false);
}
/** The HTTP path to probe: `healthCheck.path`, then `healthCheckPath`, then `fallback`. */
export function healthCheckPathOf(manifest, fallback) {
    const path = healthCheckObject(manifest).path;
    if (typeof path === "string")
        return path;
    return typeof manifest?.healthCheckPath === "string" ? manifest.healthCheckPath : fallback;
}
/**
 * Reads a manifest's health check settings. `enabled` follows {@link isHealthCheckDisabled}; `path` follows
 * {@link healthCheckPathOf} and is absent when neither the manifest nor `options.defaultPath` gives one.
 */
export function parseHealthCheckConfig(manifest, options = {}) {
    if (isHealthCheckDisabled(manifest))
        return { enabled: false };
    const { interval, timeout, retries } = healthCheckObject(manifest);
    const path = healthCheckPathOf(manifest, options.defaultPath);
    return {
        enabled: true,
        ...(path !== undefined ? { path } : {}),
        ...(interval !== undefined ? { interval } : {}),
        ...(timeout !== undefined ? { timeout } : {}),
        ...(retries !== undefined ? { retries } : {}),
    };
}
export function validateServiceManifest(value, displayPath) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { errors: [`${displayPath}: expected a JSON object`], warnings: [] };
    }
    const manifest = value;
    const errors = [];
    // A `command` service runs as a local process, so it has no stack to group generated output by (the minimal contract in
    // utils/native-service.ts). Every other service keeps the full set.
    const requiredFields = declaresCommand(manifest)
        ? ["appName", "appType", "schemaVersion"]
        : ["appName", "appType", "stack", "schemaVersion"];
    for (const field of requiredFields) {
        if (!(field in manifest))
            errors.push(`${displayPath}.${field}: required field is missing`);
    }
    for (const field of ["appName", "appType", "stack"]) {
        if (field in manifest && typeof manifest[field] !== "string") {
            errors.push(`${displayPath}.${field}: expected a string`);
        }
    }
    if ("schemaVersion" in manifest && manifest.schemaVersion !== SERVICE_MANIFEST_SCHEMA_VERSION) {
        errors.push(`${displayPath}.schemaVersion: unsupported version ${String(manifest.schemaVersion)} (supported: ${SERVICE_MANIFEST_SCHEMA_VERSION})`);
    }
    for (const field of getInvalidServiceRoutePathFields(manifest)) {
        errors.push(`${displayPath}.${field}: expected a string`);
    }
    const dev = manifest.dev;
    const liveReload = dev && typeof dev === "object" && !Array.isArray(dev)
        ? dev.liveReload
        : undefined;
    if (liveReload !== undefined && typeof liveReload !== "boolean") {
        errors.push(`${displayPath}.dev.liveReload: expected true or false`);
    }
    errors.push(...validateGeneratedStringFields(manifest, displayPath));
    errors.push(...dockerNameErrors(manifest, displayPath));
    errors.push(...fieldTypeErrors(manifest, displayPath));
    errors.push(...validateNativeServiceFields(manifest).map((error) => `${displayPath}: ${error}`));
    errors.push(...secretsErrors(manifest, displayPath));
    errors.push(...healthCheckErrors(manifest, displayPath));
    if ("smoke" in manifest) {
        for (const message of validateSmoke(manifest.smoke))
            errors.push(`${displayPath}.${message}`);
    }
    const warnings = Object.keys(manifest).flatMap((field) => {
        const deprecation = DEPRECATED_FIELDS[field];
        if (deprecation)
            return [`${displayPath}.${field}: ${deprecation}`];
        if (!KNOWN_SERVICE_FIELDS.has(field))
            return [`${displayPath}.${field}: unknown field is preserved`];
        return [];
    });
    warnings.push(...secretConflictWarnings(manifest, displayPath));
    if (liveReload === true && manifest.language !== "go") {
        warnings.push(`${displayPath}.dev.liveReload: only applies to Go services (language "go"); it is ignored here`);
    }
    const testOnSave = dev && typeof dev === "object" && !Array.isArray(dev)
        ? dev.testOnSave
        : undefined;
    const testOnSaveEnabled = testOnSave === true ||
        (testOnSave &&
            typeof testOnSave === "object" &&
            !Array.isArray(testOnSave) &&
            testOnSave.enabled !== false);
    if (testOnSaveEnabled && manifest.language !== "python") {
        warnings.push(`${displayPath}.dev.testOnSave: only applies to Python services (language "python"); it is ignored here`);
    }
    return { errors: [...new Set(errors)], warnings, manifest };
}
/**
 * Generated-output errors for one service.json. A file that cannot be read or parsed returns none here, because
 * validateServiceManifestFile reports that case.
 */
export function generatedFieldErrorsForFile(filePath, displayPath) {
    if (!existsSync(filePath))
        return [];
    try {
        const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return [];
        return validateGeneratedStringFields(parsed, displayPath);
    }
    catch {
        return [];
    }
}
export function validateServiceManifestFile(filePath, displayPath) {
    if (!existsSync(filePath)) {
        return { errors: [`${displayPath}: file is missing`], warnings: [] };
    }
    try {
        const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
        return validateServiceManifest(parsed, displayPath);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { errors: [`${displayPath}: invalid JSON (${message})`], warnings: [] };
    }
}
