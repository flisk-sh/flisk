// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTempDir } from "../../test-support/temp-project.js";
import {
  folderHoldsProject,
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
      { name: "my-shop", roots: [root], stacks: [], updatedAt: "2026-11-08T00:00:00.000Z" },
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

  it("keeps every stack a project started with, for finding its Docker names once the folder is gone", () => {
    const home = temp("flisk-registry-home-");
    const root = project("shop");

    recordProjectRoot(root, { home, stacks: ["store", "admin"] });
    recordProjectRoot(root, { home, stacks: ["admin", "ops"] });

    expect(readProjectRecords(home)[0]?.stacks).toEqual(["admin", "ops", "store"]);
  });

  it("reads a record written before stacks were recorded", () => {
    const home = temp("flisk-registry-home-");
    mkdirSync(projectRegistryDir(home), { recursive: true });
    writeFileSync(
      join(projectRegistryDir(home), "shop.json"),
      JSON.stringify({ name: "shop", roots: ["/gone"], updatedAt: "" }),
    );

    expect(readProjectRecords(home)).toEqual([
      { name: "shop", roots: ["/gone"], stacks: [], updatedAt: "" },
    ]);
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
  const record = { name: "shop", roots: ["/a", "/b"], stacks: [], updatedAt: "" };

  it("is stale only when no recorded folder still holds the project", () => {
    expect(isRecordStale(record, () => false)).toBe(true);
    expect(isRecordStale(record, (root) => root === "/b")).toBe(false);
  });

  it("is never stale without folders", () => {
    expect(isRecordStale({ ...record, roots: [] }, () => false)).toBe(false);
  });
});

// A false answer lets `flisk projects --stale --prune` delete the project's database, so only proof counts.
describe("folderHoldsProject", () => {
  it("is false when the folder is gone or its project.json is", () => {
    expect(folderHoldsProject(join(temp("flisk-holds-"), "deleted"), "shop")).toBe(false);
    expect(folderHoldsProject(temp("flisk-holds-"), "shop")).toBe(false);
  });

  it("is false when the folder now holds another project, and true for this one", () => {
    expect(folderHoldsProject(project("other"), "shop")).toBe(false);
    expect(folderHoldsProject(project("Shop"), "shop")).toBe(true);
  });

  it("is true for a half-written or nameless project.json", () => {
    const root = project("shop");
    writeFileSync(join(root, ".flisk", "project.json"), '{"project":');
    expect(folderHoldsProject(root, "shop")).toBe(true);
    writeFileSync(join(root, ".flisk", "project.json"), "{}");
    expect(folderHoldsProject(root, "shop")).toBe(true);
  });

  it("is true for a project.json that cannot be read", () => {
    const root = project("shop");
    rmSync(join(root, ".flisk", "project.json"));
    mkdirSync(join(root, ".flisk", "project.json"));
    expect(folderHoldsProject(root, "shop")).toBe(true);
  });

  it.each(["/Volumes/Backup/shop", "/mnt/data/shop", "/media/alex/Backup/shop"])(
    "is true for %s while its drive is not mounted",
    (root) => {
      expect(folderHoldsProject(root, "shop", () => false)).toBe(true);
    },
  );
});
