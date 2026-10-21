// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureGitignore,
  ensureSmokeRecordsIgnored,
  isInsideGitWorkTree,
} from "../file-helpers.js";

describe("ensureGitignore", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tdk-gitignore-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("creates .gitignore with .env and generated output", () => {
    expect(ensureGitignore(dir)).toEqual([
      ".env",
      ".tdk/.tdk-out/",
      ".tdk/.project-id",
      ".tdk/smoke/",
      "node_modules/",
    ]);
    expect(readFileSync(join(dir, ".gitignore"), "utf-8")).toContain(".env\n");
  });

  it("appends only what's missing and keeps existing lines", () => {
    writeFileSync(join(dir, ".gitignore"), "node_modules\ndist");
    expect(ensureGitignore(dir)).toEqual([
      ".env",
      ".tdk/.tdk-out/",
      ".tdk/.project-id",
      ".tdk/smoke/",
    ]);
    const content = readFileSync(join(dir, ".gitignore"), "utf-8");
    expect(content.startsWith("node_modules\ndist\n")).toBe(true);
  });

  it("is a no-op the second time", () => {
    ensureGitignore(dir);
    expect(ensureGitignore(dir)).toEqual([]);
  });
});

describe("isInsideGitWorkTree", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tdk-git-tree-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("is false for a directory that is not in a repository", () => {
    expect(isInsideGitWorkTree(dir)).toBe(false);
  });

  it("is true when an ancestor holds the .git directory of a clone", () => {
    mkdirSync(join(dir, ".git"));
    const nested = join(dir, "services", "api");
    mkdirSync(nested, { recursive: true });
    expect(isInsideGitWorkTree(nested)).toBe(true);
  });

  it("is true when the .git file of a linked worktree is there", () => {
    writeFileSync(join(dir, ".git"), "gitdir: /elsewhere/.git/worktrees/name");
    expect(isInsideGitWorkTree(dir)).toBe(true);
  });
});

describe("ensureSmokeRecordsIgnored", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tdk-smoke-ignore-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("adds the ignore entry in a git working tree", () => {
    mkdirSync(join(dir, ".git"));
    expect(ensureSmokeRecordsIgnored(dir)).toBeUndefined();
    expect(readFileSync(join(dir, ".gitignore"), "utf-8")).toContain(".tdk/smoke/");
  });

  it("writes nothing outside a git working tree", () => {
    expect(ensureSmokeRecordsIgnored(dir)).toBeUndefined();
    expect(existsSync(join(dir, ".gitignore"))).toBe(false);
  });

  it("warns instead of failing when the ignore entry cannot be written", () => {
    mkdirSync(join(dir, ".git"));
    mkdirSync(join(dir, ".gitignore"));
    const warning = ensureSmokeRecordsIgnored(dir);
    expect(warning).toMatch(/Git may track the smoke response records/);
  });
});
