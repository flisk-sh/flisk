// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTempDir } from "../../test-support/temp-project.js";
import {
  forgetProject,
  isRecordStale,
  projectRegistryDir,
  readProjectRecords,
  recordProjectRoot,
} from "../project-registry.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function temp(prefix: string): string {
  const dir = createTempDir(prefix);
  dirs.push(dir);
  return dir;
}

function project(name: string): string {
  const root = temp("flisk-registry-project-");
  mkdirSync(join(root, ".flisk"), { recursive: true });
  writeFileSync(join(root, ".flisk", "project.json"), JSON.stringify({ project: { name } }));
  return root;
}

describe("recordProjectRoot", () => {
  it("records the folder under the lowercased project name, once per folder", () => {
    const home = temp("flisk-registry-home-");
    const root = project("My-Shop");

    recordProjectRoot(root, { home, now: new Date("2026-11-07T00:00:00Z") });
    recordProjectRoot(root, { home, now: new Date("2026-11-08T00:00:00Z") });

    expect(readProjectRecords(home)).toEqual([
      { name: "my-shop", roots: [root], updatedAt: "2026-11-08T00:00:00.000Z" },
    ]);
  });

  it("keeps every folder a name was started from (worktrees share the name and its volumes)", () => {
    const home = temp("flisk-registry-home-");
    const first = project("shop");
    const second = project("shop");

    recordProjectRoot(first, { home });
    recordProjectRoot(second, { home });

    expect(readProjectRecords(home)[0]?.roots).toEqual([first, second]);
  });

  it("records nothing for a folder without a project name, and never throws", () => {
    const home = temp("flisk-registry-home-");

    recordProjectRoot(temp("flisk-registry-empty-"), { home });

    expect(existsSync(projectRegistryDir(home))).toBe(false);
    // A home that is a file cannot hold the record: the start goes on without it.
    const fileHome = join(temp("flisk-registry-file-"), "home");
    writeFileSync(fileHome, "");
    expect(() => recordProjectRoot(project("shop"), { home: fileHome })).not.toThrow();
  });

  it("skips unreadable records and forgets a project", () => {
    const home = temp("flisk-registry-home-");
    recordProjectRoot(project("shop"), { home });
    writeFileSync(join(projectRegistryDir(home), "broken.json"), "{");

    expect(readProjectRecords(home).map((record) => record.name)).toEqual(["shop"]);
    forgetProject("shop", home);
    expect(readProjectRecords(home)).toEqual([]);
    expect(readFileSync(join(projectRegistryDir(home), "broken.json"), "utf8")).toBe("{");
  });
});

describe("isRecordStale", () => {
  const record = { name: "shop", roots: ["/a", "/b"], updatedAt: "" };

  it("is stale only when no recorded folder still holds the project", () => {
    expect(isRecordStale(record, () => undefined)).toBe(true);
    expect(isRecordStale(record, (root) => (root === "/b" ? "shop" : undefined))).toBe(false);
  });

  it("counts a folder that now holds another project as gone", () => {
    expect(isRecordStale(record, () => "other")).toBe(true);
  });

  it("is never stale without folders", () => {
    expect(isRecordStale({ ...record, roots: [] }, () => undefined)).toBe(false);
  });
});
