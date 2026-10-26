// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractTarball } from "../tar.js";

let root = "";
let originalTempDirs: { TMPDIR?: string; TMP?: string; TEMP?: string };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "flisk-tar-test-"));
  originalTempDirs = {
    TMPDIR: process.env.TMPDIR,
    TMP: process.env.TMP,
    TEMP: process.env.TEMP,
  };
  process.env.TMPDIR = root;
  process.env.TMP = root;
  process.env.TEMP = root;
});

afterEach(() => {
  for (const [name, value] of Object.entries(originalTempDirs)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  rmSync(root, { recursive: true, force: true });
});

describe("extractTarball", () => {
  it("removes its temporary directory when a fallback rename fails", () => {
    const sourceRoot = join(root, "source");
    const bundleDir = join(sourceRoot, "bundle");
    mkdirSync(bundleDir, { recursive: true });
    writeFileSync(join(bundleDir, "blocked"), "replacement\n");

    const archivePath = join(root, "bundle.tar.gz");
    const tarBin = process.platform === "win32" ? "tar.exe" : "tar";
    const packed = spawnSync(tarBin, ["czf", archivePath, "-C", sourceRoot, "bundle"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (packed.status !== 0) {
      throw new Error(packed.error?.message ?? packed.stderr ?? "tar archive creation failed");
    }

    const destDir = join(root, "dest");
    const conflictingDir = join(destDir, "blocked");
    mkdirSync(conflictingDir, { recursive: true });
    writeFileSync(join(conflictingDir, "keep.txt"), "keep\n");

    expect(() => extractTarball(readFileSync(archivePath), destDir)).toThrow();
    expect(readFileSync(join(conflictingDir, "keep.txt"), "utf8")).toBe("keep\n");
    expect(readdirSync(root).filter((entry) => entry.startsWith("flisk-ext-"))).toEqual([]);
  });
});
