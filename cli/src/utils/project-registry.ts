// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Where each Flisk project that ran `flisk up` lives, one file per project name in ~/.flisk/projects/.
 *
 * Docker keeps a project's Postgres volume, images and networks after `flisk down`, and nothing on a volume says which
 * folder it belongs to: Compose labels a volume with its Compose project only, and adding our own label to an existing
 * volume makes Compose ask to recreate it (losing the data). So when a project folder is deleted (a scratch or test
 * project, an old demo clone), its volumes could never be told apart from those of a project that is only stopped.
 * This record is what tells them apart: a name whose recorded folders are all gone is stale.
 */
export interface ProjectRecord {
  name: string;
  /** Every folder this project name was started from (worktrees and clones of one repo share a name, and its volumes). */
  roots: string[];
  updatedAt: string;
}

/** Folders kept per name; the oldest are dropped first. */
const MAX_ROOTS = 20;

export function projectRegistryDir(home: string = homedir()): string {
  return join(home, ".flisk", "projects");
}

function recordPath(name: string, home: string): string {
  return join(projectRegistryDir(home), `${encodeURIComponent(name)}.json`);
}

function parseRecord(text: string): ProjectRecord | undefined {
  try {
    const value = JSON.parse(text) as Partial<ProjectRecord>;
    if (typeof value.name !== "string" || !Array.isArray(value.roots)) return undefined;
    return {
      name: value.name,
      roots: value.roots.filter((root): root is string => typeof root === "string"),
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    };
  } catch {
    return undefined;
  }
}

/** The `project.name` in `<root>/.flisk/project.json`, lowercased as the engine names Docker objects, or undefined. */
export function projectNameAt(root: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(join(root, ".flisk", "project.json"), "utf8")) as {
      project?: { name?: unknown };
    };
    return typeof parsed.project?.name === "string" ? parsed.project.name.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

/** Records that the project at `projectRoot` started. Never throws: a read-only home only loses the record. */
export function recordProjectRoot(
  projectRoot: string,
  options: { home?: string; now?: Date } = {},
): void {
  const home = options.home ?? homedir();
  const name = projectNameAt(projectRoot);
  if (!name) return;
  const root = resolve(projectRoot);
  try {
    const path = recordPath(name, home);
    const existing = existsSync(path) ? parseRecord(readFileSync(path, "utf8")) : undefined;
    const roots = [...(existing?.roots ?? []).filter((r) => r !== root), root].slice(-MAX_ROOTS);
    mkdirSync(projectRegistryDir(home), { recursive: true });
    const record: ProjectRecord = {
      name,
      roots,
      updatedAt: (options.now ?? new Date()).toISOString(),
    };
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  } catch {
    // Best effort.
  }
}

export function readProjectRecords(home: string = homedir()): ProjectRecord[] {
  const dir = projectRegistryDir(home);
  let files: string[];
  try {
    files = readdirSync(dir).filter((file) => file.endsWith(".json"));
  } catch {
    return [];
  }
  const records: ProjectRecord[] = [];
  for (const file of files) {
    try {
      const record = parseRecord(readFileSync(join(dir, file), "utf8"));
      if (record) records.push(record);
    } catch {
      // Unreadable record: skip it.
    }
  }
  return records.sort((a, b) => a.name.localeCompare(b.name));
}

export function forgetProject(name: string, home: string = homedir()): void {
  rmSync(recordPath(name, home), { force: true });
}

/**
 * True when no recorded folder of this project still holds it: each folder is gone, or now holds a project of another
 * name. A record with no folders is not stale (nothing says it is gone).
 */
export function isRecordStale(
  record: ProjectRecord,
  nameAt: (root: string) => string | undefined = projectNameAt,
): boolean {
  if (record.roots.length === 0) return false;
  return record.roots.every((root) => nameAt(root) !== record.name);
}
