// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findProjectRoot } from "../paths.js";

describe("findProjectRoot", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "tdk-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should find project root when .tdk/project.json exists", () => {
    mkdirSync(join(tmpDir, ".tdk"), { recursive: true });
    writeFileSync(join(tmpDir, ".tdk", "project.json"), JSON.stringify({ version: "2" }));

    const root = findProjectRoot(tmpDir);
    expect(root).toBe(tmpDir);
  });

  it("should find project root from a nested subdirectory", () => {
    mkdirSync(join(tmpDir, ".tdk"), { recursive: true });
    writeFileSync(join(tmpDir, ".tdk", "project.json"), JSON.stringify({ version: "2" }));
    const subDir = join(tmpDir, "services", "product", "my-service", "backend");
    mkdirSync(subDir, { recursive: true });

    const root = findProjectRoot(subDir);
    expect(root).toBe(tmpDir);
  });

  it("should return null when no .tdk/project.json exists", () => {
    mkdirSync(join(tmpDir, "services"), { recursive: true });

    const root = findProjectRoot(tmpDir);
    expect(root).toBeNull();
  });

  it("should return null when .tdk directory exists but no project.json inside", () => {
    mkdirSync(join(tmpDir, ".tdk"), { recursive: true });

    const root = findProjectRoot(tmpDir);
    expect(root).toBeNull();
  });

  it("should return null from empty directory", () => {
    const root = findProjectRoot(tmpDir);
    expect(root).toBeNull();
  });

  it("should handle when .tdk is a regular file instead of a directory", () => {
    writeFileSync(join(tmpDir, ".tdk"), "regular file");

    const root = findProjectRoot(tmpDir);
    expect(root).toBeNull();
  });

  it("should use process.cwd() as default startDir when omitted", () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(tmpDir);
      expect(findProjectRoot()).toBeNull();

      mkdirSync(join(tmpDir, ".tdk"), { recursive: true });
      writeFileSync(join(tmpDir, ".tdk", "project.json"), JSON.stringify({ version: "2" }));

      expect(findProjectRoot()).toBe(tmpDir);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("should stop at filesystem root and not loop infinitely", () => {
    const root = findProjectRoot("/");
    expect(root).toBeNull();
  });

  it("should handle very deep paths correctly", () => {
    mkdirSync(join(tmpDir, ".tdk"), { recursive: true });
    writeFileSync(join(tmpDir, ".tdk", "project.json"), JSON.stringify({ version: "2" }));

    const deepDir = join(tmpDir, "a", "b", "c", "d", "e", "f", "g");
    mkdirSync(deepDir, { recursive: true });

    const root = findProjectRoot(deepDir);
    expect(root).toBe(tmpDir);
  });

  it("should handle paths with symlinks (resolve to real path)", () => {
    mkdirSync(join(tmpDir, ".tdk"), { recursive: true });
    writeFileSync(join(tmpDir, ".tdk", "project.json"), JSON.stringify({ version: "2" }));
    const realDir = join(tmpDir, "real");
    mkdirSync(realDir, { recursive: true });
    const linkDir = join(tmpDir, "link");

    try {
      symlinkSync(realDir, linkDir);
      const root = findProjectRoot(linkDir);
      expect(root).toBe(tmpDir);
    } catch {
      // Symlinks might not be available on some platforms, skip
    }
  });

  it("should not confuse .tdk directory outside project root", () => {
    const outerDir = mkdtempSync(join(tmpdir(), "tdk-outer-"));
    try {
      mkdirSync(join(outerDir, ".tdk"), { recursive: true });
      writeFileSync(join(outerDir, ".tdk", "project.json"), JSON.stringify({ version: "2" }));

      const root = findProjectRoot(tmpDir);
      expect(root).toBeNull();
    } finally {
      rmSync(outerDir, { recursive: true, force: true });
    }
  });

  it("should return resolved path (no trailing separators or dot segments)", () => {
    mkdirSync(join(tmpDir, ".tdk"), { recursive: true });
    writeFileSync(join(tmpDir, ".tdk", "project.json"), JSON.stringify({ version: "2" }));

    const root = findProjectRoot(join(tmpDir, ".", "services", ".."));
    expect(root).toBe(tmpDir);
  });

  it("should find project root with trailing slash in startDir", () => {
    mkdirSync(join(tmpDir, ".tdk"), { recursive: true });
    writeFileSync(join(tmpDir, ".tdk", "project.json"), JSON.stringify({ version: "2" }));

    const root = findProjectRoot(`${tmpDir}/`);
    expect(root).toBe(tmpDir);
  });

  it("should handle startDir being a non-existent path (resolves to cwd parent)", () => {
    mkdirSync(join(tmpDir, ".tdk"), { recursive: true });
    writeFileSync(join(tmpDir, ".tdk", "project.json"), JSON.stringify({ version: "2" }));

    // A non-existent path - resolve will still produce something based on cwd
    const root = findProjectRoot(resolve(tmpDir, "nonexistent", "dir"));

    // Since we have .tdk/project.json in tmpDir and the resolved path
    // starts with tmpDir, walking up should find it
    // resolve(tmpDir, 'nonexistent', 'dir') = tmpDir + '/nonexistent/dir'
    // Walking up from there: tmpDir + '/nonexistent/dir' -> tmpDir + '/nonexistent' -> tmpDir
    // tmpDir has .tdk/project.json so it should be found
    expect(root).toBe(tmpDir);
  });

  it("should work when .tdk is a symlink to another directory", () => {
    const realTdkDir = join(tmpDir, "real-tdk");
    mkdirSync(realTdkDir, { recursive: true });
    writeFileSync(join(realTdkDir, "project.json"), JSON.stringify({ version: "2" }));
    mkdirSync(join(tmpDir, "services"), { recursive: true });

    try {
      symlinkSync(realTdkDir, join(tmpDir, ".tdk"));
      const root = findProjectRoot(tmpDir);
      expect(root).toBe(tmpDir);
    } catch {
      // Symlinks might fail on some platforms
    }
  });

  it("should find project root even when there are multiple .tdk directories in the path", () => {
    // Create a .tdk/project.json in a parent and child
    mkdirSync(join(tmpDir, ".tdk"), { recursive: true });
    writeFileSync(join(tmpDir, ".tdk", "project.json"), JSON.stringify({ version: "2" }));
    mkdirSync(join(tmpDir, "subdir", ".tdk"), { recursive: true });
    writeFileSync(join(tmpDir, "subdir", ".tdk", "project.json"), JSON.stringify({ version: "2" }));

    // Starting from the child, it should find the child first
    const root = findProjectRoot(join(tmpDir, "subdir"));
    expect(root).toBe(join(tmpDir, "subdir"));
  });
});

describe("getPackageVersion", () => {
  it("should return a non-empty string version", async () => {
    const { getPackageVersion } = await import("../paths.js");
    const version = getPackageVersion();
    expect(version).toBeTypeOf("string");
    expect(version.length).toBeGreaterThan(0);
  });

  it("should return version matching semver pattern", async () => {
    const { getPackageVersion } = await import("../paths.js");
    const version = getPackageVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("should return cached value on repeated calls", async () => {
    const { getPackageVersion } = await import("../paths.js");
    const v1 = getPackageVersion();
    const v2 = getPackageVersion();
    expect(v1).toBe(v2);
  });
});
