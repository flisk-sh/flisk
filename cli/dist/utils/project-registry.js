// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
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
            updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
        };
    }
    catch {
        return undefined;
    }
}
/** The `project.name` in `<root>/.flisk/project.json`, lowercased as the engine names Docker objects, or undefined. */
export function projectNameAt(root) {
    try {
        const parsed = JSON.parse(readFileSync(join(root, ".flisk", "project.json"), "utf8"));
        return typeof parsed.project?.name === "string" ? parsed.project.name.toLowerCase() : undefined;
    }
    catch {
        return undefined;
    }
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
 * True when no recorded folder of this project still holds it: each folder is gone, or now holds a project of another
 * name. A record with no folders is not stale (nothing says it is gone).
 */
export function isRecordStale(record, nameAt = projectNameAt) {
    if (record.roots.length === 0)
        return false;
    return record.roots.every((root) => nameAt(root) !== record.name);
}
