// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { readProjectNameOrUndefined } from "./project-reader.js";
/** Folders kept per name; the oldest are dropped first. */
const MAX_ROOTS = 20;
export function projectRegistryDir(home = homedir()) {
    return join(home, ".flisk", "projects");
}
function recordPath(name, home) {
    return join(projectRegistryDir(home), `${encodeURIComponent(name)}.json`);
}
function parseRecord(text) {
    try {
        const value = JSON.parse(text);
        if (typeof value.name !== "string" || !Array.isArray(value.roots))
            return undefined;
        return {
            name: value.name,
            roots: value.roots.filter((root) => typeof root === "string"),
            // Records written by 1.4.42 have no stacks: their infra volumes and golden images are still found.
            stacks: Array.isArray(value.stacks)
                ? value.stacks.filter((stack) => typeof stack === "string")
                : [],
            updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
        };
    }
    catch {
        return undefined;
    }
}
/**
 * The effective project name at `root`, lowercased as the engine names Docker objects, or undefined.
 * Pass an empty `env` when checking another checkout so this process's shell override is not applied to it (#4046).
 */
export function projectNameAt(root, env = process.env) {
    return readProjectNameOrUndefined(root, env);
}
/** Records that the project at `projectRoot` started. Never throws: a read-only home only loses the record. */
export function recordProjectRoot(projectRoot, options = {}) {
    const home = options.home ?? homedir();
    const name = projectNameAt(projectRoot);
    if (!name)
        return;
    const root = resolve(projectRoot);
    try {
        const path = recordPath(name, home);
        const existing = existsSync(path) ? parseRecord(readFileSync(path, "utf8")) : undefined;
        const roots = [...(existing?.roots ?? []).filter((r) => r !== root), root].slice(-MAX_ROOTS);
        mkdirSync(projectRegistryDir(home), { recursive: true });
        const record = {
            name,
            roots,
            stacks: [...new Set([...(existing?.stacks ?? []), ...(options.stacks ?? [])])].sort(),
            updatedAt: (options.now ?? new Date()).toISOString(),
        };
        writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
    }
    catch {
        // Best effort.
    }
}
export function readProjectRecords(home = homedir()) {
    const dir = projectRegistryDir(home);
    let files;
    try {
        files = readdirSync(dir).filter((file) => file.endsWith(".json"));
    }
    catch {
        return [];
    }
    const records = [];
    for (const file of files) {
        try {
            const record = parseRecord(readFileSync(join(dir, file), "utf8"));
            if (record)
                records.push(record);
        }
        catch {
            // Unreadable record: skip it.
        }
    }
    return records.sort((a, b) => a.name.localeCompare(b.name));
}
export function forgetProject(name, home = homedir()) {
    rmSync(recordPath(name, home), { force: true });
}
/**
 * False only when the folder provably no longer holds project `name`: its project.json is gone, or names another
 * project. Anything uncertain (a drive that is not mounted, a file that cannot be read or is half written) counts as
 * still holding it, because a false answer lets `flisk projects --stale --prune` delete the project's database.
 */
export function folderHoldsProject(root, name, pathExists = existsSync) {
    const mount = /^(\/Volumes\/[^/]+|\/mnt\/[^/]+|\/media\/[^/]+\/[^/]+)/.exec(root)?.[1];
    if (mount && !pathExists(mount))
        return true;
    // A local override names this checkout, so it wins over the tracked config here too. A half-written
    // local file is uncertainty, never proof that the folder no longer holds the project (#4046).
    let localText;
    try {
        localText = readFileSync(join(root, ".flisk", "project.local.json"), "utf8");
    }
    catch (err) {
        const code = err.code;
        if (code !== "ENOENT" && code !== "ENOTDIR")
            return true;
    }
    if (localText !== undefined) {
        try {
            const found = JSON.parse(localText).project?.name;
            return typeof found === "string" ? found.trim().toLowerCase() === name : true;
        }
        catch {
            return true;
        }
    }
    let text;
    try {
        text = readFileSync(join(root, ".flisk", "project.json"), "utf8");
    }
    catch (err) {
        const code = err.code;
        return code !== "ENOENT" && code !== "ENOTDIR";
    }
    try {
        const found = JSON.parse(text).project?.name;
        return typeof found !== "string" || found.trim().toLowerCase() === name;
    }
    catch {
        return true;
    }
}
/** True when no recorded folder still holds the project. A record with no folders is not stale (nothing says it is gone). */
export function isRecordStale(record, holds = folderHoldsProject) {
    if (record.roots.length === 0)
        return false;
    return record.roots.every((root) => !holds(root, record.name));
}
