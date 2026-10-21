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
    rmSync(directory, { recursive: true, force: true });
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
    expect(findOnPath("tdk-definitely-missing")).toBeNull();
  });
});
