// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { validateSmoke } from "./smoke.js";
export const SERVICE_MANIFEST_SCHEMA_VERSION = 1;
export const SERVICE_MANIFEST_SCHEMA_URL = "https://tdk-landscape.github.io/schema.service.json";
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
    "databaseName",
    "dependencies",
    "dev",
    "dependsOn",
    "dockerfile",
    "enabled",
    "exposeViaProxy",
    "featuresEnabled",
    "framework",
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
const SERVICE_ROUTE_PATH_FIELDS = ["apiPath", "basePath"];
export function getInvalidServiceRoutePathFields(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return [];
    const manifest = value;
    return SERVICE_ROUTE_PATH_FIELDS.filter((field) => field in manifest && typeof manifest[field] !== "string");
}
export function validateServiceManifest(value, displayPath) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { errors: [`${displayPath}: expected a JSON object`], warnings: [] };
    }
    const manifest = value;
    const errors = [];
    for (const field of ["appName", "appType", "stack", "schemaVersion"]) {
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
    if (liveReload === true && manifest.language !== "go") {
        warnings.push(`${displayPath}.dev.liveReload: only applies to Go services (language "go"); it is ignored here`);
    }
    return { errors, warnings, manifest };
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
