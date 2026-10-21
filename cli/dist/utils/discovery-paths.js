// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { PROJECT_JSON } from "./constants.js";
// Mirrors discovery/json_manifest_scanner.star: every `discovery.paths` entry is a shell
// glob of directories, and `find -maxdepth 3` looks for service.json under each match. So a
// resource is only seen by Tilt if some directory matching a pattern is the resource
// directory itself or at most this many levels above it.
const MAX_LEVELS_BELOW_MATCH = 2;
const DEFAULT_DISCOVERY_PATHS = ["services/*/*"];
function segments(path) {
    return path.split(sep).filter(Boolean);
}
// Wildcard match without building a RegExp: `*` matches any run of characters, `?` one character,
// everything else is literal. Greedy with a single backtrack point, so it stays linear-ish on
// hostile patterns such as "a*a*a*b".
function segmentMatches(pattern, name) {
    let p = 0;
    let n = 0;
    let starP = -1;
    let starN = 0;
    while (n < name.length) {
        if (p < pattern.length &&
            pattern[p] !== "*" &&
            (pattern[p] === "?" || pattern[p] === name[n])) {
            p++;
            n++;
        }
        else if (p < pattern.length && pattern[p] === "*") {
            starP = p++;
            starN = n;
        }
        else if (starP !== -1) {
            p = starP + 1;
            n = ++starN;
        }
        else {
            return false;
        }
    }
    while (p < pattern.length && pattern[p] === "*")
        p++;
    return p === pattern.length;
}
function globMatchesDir(patternSegments, dirSegments) {
    return (patternSegments.length === dirSegments.length &&
        patternSegments.every((segment, index) => segmentMatches(segment, dirSegments[index])));
}
/** `discovery.paths` from .tdk/project.json, or the generic default when unset/unreadable. */
export function readDiscoveryPaths(projectRoot) {
    const configPath = join(projectRoot, ".tdk", PROJECT_JSON);
    if (!existsSync(configPath))
        return DEFAULT_DISCOVERY_PATHS;
    try {
        const paths = JSON.parse(readFileSync(configPath, "utf-8"))?.discovery?.paths;
        if (Array.isArray(paths) && paths.every((p) => typeof p === "string"))
            return paths;
    }
    catch { }
    return DEFAULT_DISCOVERY_PATHS;
}
/** Whether Tilt's discovery would find a service.json in `resourceDir` given `patterns`. */
export function isPathDiscovered(projectRoot, resourceDir, patterns) {
    const resourceSegments = segments(relative(projectRoot, resolve(projectRoot, resourceDir)));
    return patterns.some((pattern) => {
        const patternSegments = segments(relative(projectRoot, resolve(projectRoot, pattern)));
        for (let levels = 0; levels <= MAX_LEVELS_BELOW_MATCH; levels++) {
            const depth = resourceSegments.length - levels;
            if (depth > 0 && globMatchesDir(patternSegments, resourceSegments.slice(0, depth))) {
                return true;
            }
        }
        return false;
    });
}
/**
 * Picks the folder for a new resource without an explicit --path. The conventional folder
 * per type (apps/, workers/, packages/) is kept when discovery covers it; otherwise the
 * resource goes under services/<stack>/, which the default discovery paths cover, because a
 * resource outside every discovery path is scaffolded but never started by `flisk up`.
 */
export function chooseResourcePath(projectRoot, conventionalPath, stack, name) {
    const patterns = readDiscoveryPaths(projectRoot);
    if (isPathDiscovered(projectRoot, conventionalPath, patterns)) {
        return { path: conventionalPath };
    }
    const fallback = `services/${stack}/${name}`;
    if (isPathDiscovered(projectRoot, fallback, patterns)) {
        return { path: fallback, adjustedFrom: conventionalPath };
    }
    return { path: conventionalPath };
}
