// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SERVICE_JSON } from "./constants.js";
import { isNativeProject } from "./native-service.js";
import { findProjectRoot } from "./paths.js";
import { discoverResourcesWithProblems } from "./services.js";
/** True when `dir` or a directory up to two levels below it has a service.json; a cheap test before a full discovery scan. */
export function hasNearbyServiceJson(dir, depth = 0) {
    if (existsSync(join(dir, SERVICE_JSON)))
        return true;
    if (depth >= 2)
        return false;
    try {
        return readdirSync(dir, { withFileTypes: true }).some((entry) => entry.isDirectory() &&
            !entry.name.startsWith(".") &&
            entry.name !== "node_modules" &&
            hasNearbyServiceJson(join(dir, entry.name), depth + 1));
    }
    catch {
        return false;
    }
}
/**
 * The project a command for local processes works on: the Flisk project around `cwd`, or, before the first `flisk up` wrote
 * .flisk/project.json, `cwd` itself when every service.json near it declares `command` (the directory `flisk up` adopts).
 * Returns its services only when they all declare `command`; null otherwise, including outside any project.
 */
export function findNativeProject(cwd = process.cwd()) {
    const projectRoot = findProjectRoot(cwd) ?? (hasNearbyServiceJson(cwd) ? cwd : null);
    if (!projectRoot)
        return null;
    try {
        const { resources } = discoverResourcesWithProblems(projectRoot);
        return isNativeProject(resources) ? { projectRoot, resources } : null;
    }
    catch {
        return null;
    }
}
