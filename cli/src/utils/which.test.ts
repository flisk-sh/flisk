// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findOnPath } from "./which.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    try {
      rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 });
    } catch (error) {
      // Windows: the runner can keep a fresh temp dir locked past the test (AV, Search indexer); a leaked
      // temp dir is less harmful than failing a passing test, so the cleanup stays best-effort there.
      if (process.platform !== "win32") throw error;
    }
});

describe("findOnPath", () => {
  it("finds an existing command on PATH", () => {
    const directory = mkdtempSync(join(tmpdir(), "flisk-path-"));
    directories.push(directory);
    writeFileSync(join(directory, "tool"), "");
    const original = process.env.PATH;
    process.env.PATH = directory;
    try {
      expect(findOnPath("tool")).toBe(join(directory, "tool"));
    } finally {
      process.env.PATH = original;
    }
  });

  it("returns null when a command is absent", () => {
    const directory = mkdtempSync(join(tmpdir(), "flisk-path-"));
    directories.push(directory);
    expect(findOnPath("flisk-definitely-missing")).toBeNull();
  });
});
