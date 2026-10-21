// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkStarlarkLoadExports,
  collectReachableStarlarkFiles,
  findMissingRelativeStarlarkLoads,
  findPrivateStarlarkLoadExports,
  findRelativeStarlarkLoadTargets,
  resolveStarlarkLoadTarget,
} from "../doctor-starlark.js";

describe("Starlark doctor helpers", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "flisk-doctor-starlark-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function writeProjectFile(relativePath: string, content: string): string {
    const file = join(projectRoot, relativePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    return file;
  }

  it("finds private names exported by a relative load", () => {
    expect(
      findPrivateStarlarkLoadExports('load("./library.star", "_private", visible = "public")'),
    ).toEqual(["_private"]);
  });

  it("resolves relative paths and leaves external loads alone", () => {
    const entry = join(projectRoot, "Tiltfile");

    expect(resolveStarlarkLoadTarget(entry, "./library.star", projectRoot)).toBe(
      join(projectRoot, "library.star"),
    );
    expect(resolveStarlarkLoadTarget(entry, "ext://tdk-cli", projectRoot)).toBe(
      join(projectRoot, ".tdk", ".tdk-out", "tdk-cli-ext", "Tiltfile"),
    );
    expect(resolveStarlarkLoadTarget(entry, "@repo//:library.star", projectRoot)).toBeNull();
  });

  it("reports a missing relative load target", () => {
    const entry = writeProjectFile("Tiltfile", 'load("./missing.star", "value")');

    expect(
      findMissingRelativeStarlarkLoads(entry, readFileSync(entry, "utf-8"), projectRoot),
    ).toEqual([`${entry}: ./missing.star -> ${join(projectRoot, "missing.star")}`]);
  });

  it("finds reachable targets without repeating a cycle", () => {
    const entry = writeProjectFile("Tiltfile", 'load("./library.star", "value")');
    const library = writeProjectFile("library.star", 'load("./Tiltfile", "value")');

    expect(
      findRelativeStarlarkLoadTargets(entry, readFileSync(entry, "utf-8"), projectRoot),
    ).toEqual([library]);
    expect(collectReachableStarlarkFiles(entry, projectRoot)).toEqual([entry, library].sort());
  });

  it("keeps an entry file with no loads reachable", () => {
    const entry = writeProjectFile("Tiltfile", "# no loads");

    expect(
      findRelativeStarlarkLoadTargets(entry, readFileSync(entry, "utf-8"), projectRoot),
    ).toEqual([]);
    expect(collectReachableStarlarkFiles(entry, projectRoot)).toEqual([entry]);
  });

  it("handles edge cases in load parsing, targets, and unresolved files", () => {
    // Single quotes and aliases in findPrivateStarlarkLoadExports
    const multiLoad = [
      "load('./a.star', '_internal', pub = 'visible')",
      'load("./b.star", alias = "_shadowed")',
      'load("./c.star")',
    ].join("\n");
    expect(findPrivateStarlarkLoadExports(multiLoad)).toEqual(["_internal", "_shadowed"]);

    // Relative targets without leading ./
    const entry = join(projectRoot, "subdir", "Tiltfile");
    expect(resolveStarlarkLoadTarget(entry, "shared.star", projectRoot)).toBe(
      join(projectRoot, "subdir", "shared.star"),
    );
    expect(
      resolveStarlarkLoadTarget(entry, "https://example.com/rules.star", projectRoot),
    ).toBeNull();

    // Malformed load without module string and external load in findMissingRelativeStarlarkLoads
    expect(findMissingRelativeStarlarkLoads(entry, "load()", projectRoot)).toEqual([]);
    expect(
      findMissingRelativeStarlarkLoads(entry, 'load("@repo//:rule.star", "rule")', projectRoot),
    ).toEqual([]);

    // Target file that does not exist in collectReachableStarlarkFiles
    const missingLoadFile = writeProjectFile("Tiltfile", 'load("./ghost.star", "val")');
    expect(collectReachableStarlarkFiles(missingLoadFile, projectRoot)).toEqual([missingLoadFile]);
  });
});

describe("checkStarlarkLoadExports", () => {
  let projectRoot: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    projectRoot = mkdtempSync(join(tmpdir(), "flisk-doctor-check-starlark-"));
    process.chdir(projectRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function writeProjectFile(relativePath: string, content: string): string {
    const file = join(projectRoot, relativePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    return file;
  }

  it("skips when no generated Tiltfile exists", () => {
    writeProjectFile(".tdk/project.json", '{"name":"test"}');
    const result = checkStarlarkLoadExports();
    expect(result.isSkipped).toBe(true);
    expect(result.didPass).toBe(true);
    expect(result.message).toBe("No generated Tiltfile to check");
  });

  it("passes when reachable Starlark files have valid load exports and targets", () => {
    writeProjectFile(".tdk/project.json", '{"name":"test"}');
    writeProjectFile(".tdk/.tdk-out/Tiltfile", 'load("./helper.star", "my_func")');
    writeProjectFile(".tdk/.tdk-out/helper.star", "def my_func(): pass");

    const result = checkStarlarkLoadExports();
    expect(result.didPass).toBe(true);
    expect(result.message).toContain(
      "2 reachable Starlark files have valid load exports and paths",
    );
  });

  it("fails when reachable Starlark files export private symbols starting with underscore", () => {
    writeProjectFile(".tdk/project.json", '{"name":"test"}');
    writeProjectFile(".tdk/.tdk-out/Tiltfile", 'load("./helper.star", "_private_fn", "public_fn")');
    writeProjectFile(".tdk/.tdk-out/helper.star", "def _private_fn(): pass");

    const result = checkStarlarkLoadExports();
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("Private exported symbols:");
    expect(result.message).toContain("_private_fn");
    expect(result.fix).toContain("tdk config regenerate");
  });

  it("fails when reachable Starlark files have missing relative load targets", () => {
    writeProjectFile(".tdk/project.json", '{"name":"test"}');
    writeProjectFile(".tdk/.tdk-out/Tiltfile", 'load("./nonexistent.star", "symbol")');

    const result = checkStarlarkLoadExports();
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("Missing relative load targets:");
    expect(result.message).toContain("nonexistent.star");
    expect(result.fix).toContain("tdk config regenerate");
  });

  it("reports both private exports and missing targets when both occur", () => {
    writeProjectFile(".tdk/project.json", '{"name":"test"}');
    writeProjectFile(
      ".tdk/.tdk-out/Tiltfile",
      'load("./helper.star", "_secret")\nload("./missing.star", "other")',
    );
    writeProjectFile(".tdk/.tdk-out/helper.star", "def _secret(): pass");

    const result = checkStarlarkLoadExports();
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("Private exported symbols:");
    expect(result.message).toContain("_secret");
    expect(result.message).toContain("Missing relative load targets:");
    expect(result.message).toContain("missing.star");
  });
});
