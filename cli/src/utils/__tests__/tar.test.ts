// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FliskError } from "../errors.js";
import { extractTarball } from "../tar.js";

const { spawnSyncMock, state } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(),
  state: { realSpawnSync: null as typeof import("node:child_process").spawnSync | null },
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  state.realSpawnSync = actual.spawnSync;
  return {
    ...actual,
    spawnSync: (...args: Parameters<typeof actual.spawnSync>) => {
      const impl = spawnSyncMock.getMockImplementation();
      if (impl) {
        return impl(...args);
      }
      return actual.spawnSync(...args);
    },
  };
});

const tarBin = process.platform === "win32" ? "tar.exe" : "tar";

function packArchive(archivePath: string, cwd: string, ...entries: string[]) {
  if (!state.realSpawnSync) throw new Error("realSpawnSync not initialized");
  const packed = state.realSpawnSync(tarBin, ["czf", archivePath, "-C", cwd, ...entries], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (packed.status !== 0) {
    throw new Error(packed.error?.message ?? packed.stderr ?? "tar archive creation failed");
  }
}

let root = "";
let originalTempDirs: { TMPDIR?: string; TMP?: string; TEMP?: string };

beforeEach(() => {
  spawnSyncMock.mockReset();
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
  spawnSyncMock.mockReset();
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
  describe("Scenario A — Single top-level directory", () => {
    it("extracts package/a.txt into destDir/a.txt with stripped prefix", () => {
      const sourceRoot = join(root, "source-a");
      const packageDir = join(sourceRoot, "package");
      mkdirSync(packageDir, { recursive: true });
      writeFileSync(join(packageDir, "a.txt"), "hello from package a\n");

      const archivePath = join(root, "package-archive.tar.gz");
      packArchive(archivePath, sourceRoot, "package");

      const destDir = join(root, "dest-a");
      extractTarball(readFileSync(archivePath), destDir);

      expect(existsSync(join(destDir, "a.txt"))).toBe(true);
      expect(readFileSync(join(destDir, "a.txt"), "utf8")).toBe("hello from package a\n");
      expect(readdirSync(destDir)).toEqual(["a.txt"]);
      expect(readdirSync(root).filter((entry) => entry.startsWith("flisk-ext-"))).toEqual([]);
    });
  });

  describe("Scenario B — Multiple top-level entries & fallback path", () => {
    it("extracts multiple top-level entries when fallback path is executed", () => {
      const sourceRoot = join(root, "source-b");
      mkdirSync(sourceRoot, { recursive: true });
      writeFileSync(join(sourceRoot, "first.txt"), "first content\n");
      writeFileSync(join(sourceRoot, "second.txt"), "second content\n");

      const archivePath = join(root, "multiple-entries.tar.gz");
      packArchive(archivePath, sourceRoot, "first.txt", "second.txt");

      let fallbackTriggered = false;

      // Simulate failure of the initial `--strip-components=1` command (which happens naturally
      // on GNU tar when entries lack path components) so that real fallback tar extraction executes.
      spawnSyncMock.mockImplementation((cmd, args, options) => {
        const argList = Array.isArray(args) ? args : [];
        if (argList.includes("--strip-components=1")) {
          fallbackTriggered = true;
          return {
            status: 1,
            signal: null,
            output: [null, Buffer.from(""), Buffer.from("strip-components failed\n")],
            pid: 12345,
            stdout: Buffer.from(""),
            stderr: Buffer.from("strip-components failed\n"),
          };
        }
        if (!state.realSpawnSync) throw new Error("realSpawnSync not initialized");
        // Let the real tar binary execute the fallback extraction into fallbackDir
        return state.realSpawnSync(cmd, args, options);
      });

      const destDir = join(root, "dest-b");
      extractTarball(readFileSync(archivePath), destDir);

      expect(fallbackTriggered).toBe(true);
      expect(existsSync(join(destDir, "first.txt"))).toBe(true);
      expect(existsSync(join(destDir, "second.txt"))).toBe(true);
      expect(readFileSync(join(destDir, "first.txt"), "utf8")).toBe("first content\n");
      expect(readFileSync(join(destDir, "second.txt"), "utf8")).toBe("second content\n");
      expect(readdirSync(destDir).sort()).toEqual(["first.txt", "second.txt"]);
      expect(readdirSync(root).filter((entry) => entry.startsWith("flisk-ext-"))).toEqual([]);
    });

    it("extracts multiple top-level directories preserving inner files", () => {
      const sourceRoot = join(root, "source-dirs");
      mkdirSync(join(sourceRoot, "dir1"), { recursive: true });
      mkdirSync(join(sourceRoot, "dir2"), { recursive: true });
      writeFileSync(join(sourceRoot, "dir1", "f1.txt"), "f1\n");
      writeFileSync(join(sourceRoot, "dir2", "f2.txt"), "f2\n");

      const archivePath = join(root, "two-dirs.tar.gz");
      packArchive(archivePath, sourceRoot, "dir1", "dir2");

      const destDir = join(root, "dest-dirs");
      extractTarball(readFileSync(archivePath), destDir);

      expect(existsSync(join(destDir, "f1.txt"))).toBe(true);
      expect(existsSync(join(destDir, "f2.txt"))).toBe(true);
      expect(readFileSync(join(destDir, "f1.txt"), "utf8")).toBe("f1\n");
      expect(readFileSync(join(destDir, "f2.txt"), "utf8")).toBe("f2\n");
    });
  });

  describe("Scenario C — Corrupted archive", () => {
    it("fails with 'tar extraction failed' for corrupted input and does not leak files", () => {
      const destDir = join(root, "dest-corrupt");
      const invalidData = Buffer.from("this is completely invalid tar content 0123456789\x00\xff");

      expect(() => extractTarball(invalidData, destDir)).toThrow(FliskError);
      expect(() => extractTarball(invalidData, destDir)).toThrow(/tar extraction failed/);

      // Verify no temporary extraction folders were leaked
      expect(readdirSync(root).filter((entry) => entry.startsWith("flisk-ext-"))).toEqual([]);
    });
  });

  describe("Scenario D — Cleanup", () => {
    it("removes its temporary directory when a fallback rename fails", () => {
      const sourceRoot = join(root, "source");
      const bundleDir = join(sourceRoot, "bundle");
      mkdirSync(bundleDir, { recursive: true });
      writeFileSync(join(bundleDir, "blocked"), "replacement\n");

      const archivePath = join(root, "bundle.tar.gz");
      packArchive(archivePath, sourceRoot, "bundle");

      const destDir = join(root, "dest");
      const conflictingDir = join(destDir, "blocked");
      mkdirSync(conflictingDir, { recursive: true });
      writeFileSync(join(conflictingDir, "keep.txt"), "keep\n");

      expect(() => extractTarball(readFileSync(archivePath), destDir)).toThrow();
      expect(readFileSync(join(conflictingDir, "keep.txt"), "utf8")).toBe("keep\n");
      expect(readdirSync(root).filter((entry) => entry.startsWith("flisk-ext-"))).toEqual([]);
    });
  });
});
