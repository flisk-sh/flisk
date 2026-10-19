// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeTextFileAtomic } from "../atomic-write.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tdk-atomic-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("writeTextFileAtomic", () => {
  it("creates a new file", () => {
    const target = join(dir, "Tiltfile");
    writeTextFileAtomic(target, "new\n");
    expect(readFileSync(target, "utf-8")).toBe("new\n");
  });

  it("writes an empty file cleanly", () => {
    const target = join(dir, "empty.txt");
    writeTextFileAtomic(target, "");
    expect(readFileSync(target, "utf-8")).toBe("");
  });

  it("replaces an existing file and leaves no temp file behind", () => {
    const target = join(dir, "Tiltfile");
    writeFileSync(target, "old\n");
    writeTextFileAtomic(target, "new\n");
    expect(readFileSync(target, "utf-8")).toBe("new\n");
    expect(readdirSync(dir)).toEqual(["Tiltfile"]);
  });

  it("replaces a larger file with shorter content without leaving leftover bytes", () => {
    const target = join(dir, "shrink.txt");
    writeFileSync(target, "A very long line that should be completely overwritten\n");
    writeTextFileAtomic(target, "short\n");
    expect(readFileSync(target, "utf-8")).toBe("short\n");
  });

  it("keeps the mode of the file it replaces on POSIX systems", () => {
    if (process.platform === "win32") {
      // Windows NTFS permissions do not map to POSIX 0o755 permission bits.
      return;
    }
    const target = join(dir, "run.sh");
    writeFileSync(target, "old\n");
    chmodSync(target, 0o755);
    writeTextFileAtomic(target, "new\n");
    expect(statSync(target).mode & 0o777).toBe(0o755);
  });

  it("writes content larger than one pipe buffer in full", () => {
    const target = join(dir, "big.yml");
    const content = `${"x".repeat(200_000)}\n`;
    writeTextFileAtomic(target, content);
    expect(readFileSync(target, "utf-8")).toBe(content);
  });

  it("leaves the target untouched and removes its temp file when the replace fails", () => {
    const target = join(dir, "blocked");
    mkdirSync(target);
    writeFileSync(join(target, "keep.txt"), "keep\n");
    expect(() => writeTextFileAtomic(target, "new\n")).toThrow();
    expect(readFileSync(join(target, "keep.txt"), "utf-8")).toBe("keep\n");
    expect(readdirSync(dir)).toEqual(["blocked"]);
  });

  it("fails without creating anything when the directory does not exist", () => {
    expect(() => writeTextFileAtomic(join(dir, "missing", "f"), "x")).toThrow();
    expect(readdirSync(dir)).toEqual([]);
  });

  it("handles repeated writes to the same destination sequentially", () => {
    const target = join(dir, "sequential.txt");
    writeTextFileAtomic(target, "step 1\n");
    expect(readFileSync(target, "utf-8")).toBe("step 1\n");
    writeTextFileAtomic(target, "step 2\n");
    expect(readFileSync(target, "utf-8")).toBe("step 2\n");
    writeTextFileAtomic(target, "step 3\n");
    expect(readFileSync(target, "utf-8")).toBe("step 3\n");
    expect(readdirSync(dir)).toEqual(["sequential.txt"]);
  });
});
