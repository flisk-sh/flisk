// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
/** Environment variable exposing the stable per-checkout 8-hex identifier. */
export const CHECKOUT_ID_ENV = "FLISK_CHECKOUT_ID";
/** Environment variable exposing the sanitized per-checkout folder name. */
export const CHECKOUT_NAME_ENV = "FLISK_CHECKOUT_NAME";
/** Relative path under a project root where the path-bound checkout id is stored. */
export const CHECKOUT_ID_RELATIVE_PATH = join(".flisk", ".project-id");
const CHECKOUT_ID_PATTERN = /^[0-9a-f]{8}$/;
/**
 * Sanitizes a directory name into lowercase `[a-z0-9-]` characters for use as `FLISK_CHECKOUT_NAME`.
 */
export function sanitizeCheckoutName(rawName) {
    const sanitized = rawName
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
        .join("-");
    return sanitized || "checkout";
}
/**
 * Returns the sanitized checkout name derived from the project root folder name.
 */
export function getCheckoutName(projectRoot) {
    return sanitizeCheckoutName(basename(resolve(projectRoot)));
}
/**
 * Resolves a project root to its canonical absolute path so symlink aliases
 * (such as `/tmp` vs `/private/tmp` on macOS) match the same stored path.
 */
export function canonicalCheckoutPath(projectRoot) {
    const resolved = resolve(projectRoot);
    try {
        return realpathSync(resolved);
    }
    catch {
        return resolved;
    }
}
function readPersistedCheckoutId(idPath) {
    if (!existsSync(idPath))
        return null;
    try {
        const raw = readFileSync(idPath, "utf-8").trim();
        if (!raw.startsWith("{"))
            return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed.id === "string" &&
            CHECKOUT_ID_PATTERN.test(parsed.id) &&
            typeof parsed.path === "string" &&
            parsed.path.length > 0) {
            return { id: parsed.id, path: parsed.path };
        }
        return null;
    }
    catch {
        return null;
    }
}
function generateHexId(avoid) {
    let id = randomBytes(4).toString("hex");
    while (avoid !== undefined && id === avoid) {
        id = randomBytes(4).toString("hex");
    }
    return id;
}
function deterministicFallbackId(canonicalPath) {
    return createHash("sha256").update(canonicalPath).digest("hex").slice(0, 8);
}
/**
 * Returns the stable 8-hex-character checkout id for `projectRoot`, creating
 * `.flisk/.project-id` if needed.
 *
 * The file records both the id and the canonical absolute path it was created
 * for. If the recorded path differs from the current path (the folder was
 * copied or moved), a fresh id is generated and persisted so two copies never
 * share one.
 */
export function getCheckoutId(projectRoot, options = {}) {
    const currentPath = canonicalCheckoutPath(projectRoot);
    const idPath = join(projectRoot, CHECKOUT_ID_RELATIVE_PATH);
    const persisted = readPersistedCheckoutId(idPath);
    if (persisted && persisted.path === currentPath) {
        return persisted.id;
    }
    if (options.persist === false) {
        return deterministicFallbackId(currentPath);
    }
    const nextId = generateHexId(persisted?.id);
    try {
        mkdirSync(join(projectRoot, ".flisk"), { recursive: true });
        const record = { id: nextId, path: currentPath };
        writeFileSync(idPath, `${JSON.stringify(record)}\n`, "utf-8");
        return nextId;
    }
    catch {
        return deterministicFallbackId(currentPath);
    }
}
/**
 * Returns both the checkout id and sanitized checkout name for `projectRoot`.
 */
export function getCheckoutIdentity(projectRoot, options = {}) {
    return {
        id: getCheckoutId(projectRoot, options),
        name: getCheckoutName(projectRoot),
    };
}
/**
 * Returns the environment map (`FLISK_CHECKOUT_ID` and `FLISK_CHECKOUT_NAME`)
 * for `projectRoot`.
 */
export function checkoutEnvVars(projectRoot, options = {}) {
    const identity = getCheckoutIdentity(projectRoot, options);
    return {
        [CHECKOUT_ID_ENV]: identity.id,
        [CHECKOUT_NAME_ENV]: identity.name,
    };
}
/**
 * Exports `FLISK_CHECKOUT_ID` and `FLISK_CHECKOUT_NAME` into `target`
 * (defaults to `process.env`) so child processes such as Tilt and Docker Compose
 * inherit them for interpolation.
 */
export function exportCheckoutEnv(projectRoot, target = process.env) {
    const identity = getCheckoutIdentity(projectRoot);
    target[CHECKOUT_ID_ENV] = identity.id;
    target[CHECKOUT_NAME_ENV] = identity.name;
    return identity;
}
