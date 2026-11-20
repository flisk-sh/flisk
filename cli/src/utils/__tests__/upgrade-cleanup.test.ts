// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupRunningBinaryArtifacts,
  cleanupStaleUpgradeArtifacts,
  isStandaloneBinaryExecPath,
  isWindowsBusyError,
  staleBackupPathFor,
} from "../upgrade-cleanup.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "flisk-upgrade-cleanup-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("upgrade-cleanup", () => {
  it("detects Windows in-use error codes", () => {
    expect(isWindowsBusyError(Object.assign(new Error("perm"), { code: "EPERM" }))).toBe(true);
    expect(isWindowsBusyError(Object.assign(new Error("busy"), { code: "EBUSY" }))).toBe(true);
    expect(isWindowsBusyError(Object.assign(new Error("access"), { code: "EACCES" }))).toBe(true);
    expect(isWindowsBusyError(Object.assign(new Error("missing"), { code: "ENOENT" }))).toBe(false);
    expect(isWindowsBusyError(new Error("generic"))).toBe(false);
  });

  it("identifies standalone binary exec paths on Windows and POSIX", () => {
    expect(isStandaloneBinaryExecPath("C:\\Users\\dev\\.flisk\\flisk.exe", "win32")).toBe(true);
    expect(isStandaloneBinaryExecPath("C:\\Users\\dev\\.flisk\\FLISK.EXE", "win32")).toBe(true);
    expect(isStandaloneBinaryExecPath("/usr/local/bin/flisk", "darwin")).toBe(true);
    expect(isStandaloneBinaryExecPath("C:\\Program Files\\nodejs\\node.exe", "win32")).toBe(false);
    expect(isStandaloneBinaryExecPath("/usr/local/bin/node", "linux")).toBe(false);
    expect(isStandaloneBinaryExecPath("/Users/dev/.bun/bin/bun", "darwin")).toBe(false);
    expect(staleBackupPathFor("C:\\tools\\flisk.exe")).toBe("C:\\tools\\flisk.exe.old");
  });

  it("removes .old binaries and dead .flisk-upgrade-* dirs while keeping active and unrelated entries", () => {
    writeFileSync(join(dir, "flisk.exe"), "new");
    writeFileSync(join(dir, "flisk.exe.old"), "old");
    mkdirSync(join(dir, "flisk-cli"));
    mkdirSync(join(dir, ".flisk-upgrade-11111-1700000000000"));
    writeFileSync(join(dir, ".flisk-upgrade-11111-1700000000000", "flisk.exe.previous"), "old");
    mkdirSync(join(dir, ".flisk-upgrade-22222-1700000000001"));
    mkdirSync(join(dir, ".flisk-upgrade-33333-1700000000002"));

    const removed = cleanupStaleUpgradeArtifacts(dir, {
      currentPid: 33333,
      binaryName: "flisk.exe",
      isPidAlive: (pid) => pid === 22222,
    });

    expect(removed.sort()).toEqual([".flisk-upgrade-11111-1700000000000", "flisk.exe.old"]);
    expect(existsSync(join(dir, "flisk.exe"))).toBe(true);
    expect(existsSync(join(dir, "flisk-cli"))).toBe(true);
    expect(existsSync(join(dir, "flisk.exe.old"))).toBe(false);
    expect(existsSync(join(dir, ".flisk-upgrade-11111-1700000000000"))).toBe(false);
    expect(existsSync(join(dir, ".flisk-upgrade-22222-1700000000001"))).toBe(true);
    expect(existsSync(join(dir, ".flisk-upgrade-33333-1700000000002"))).toBe(true);
  });

  it("ignores EPERM/EBUSY on locked entries and still deletes unlocked ones", () => {
    writeFileSync(join(dir, "flisk.exe.old"), "locked");
    mkdirSync(join(dir, ".flisk-upgrade-44444-1700000000000"));

    const mockRmSync = vi.fn(
      (targetPath: Parameters<typeof rmSync>[0], opts?: Parameters<typeof rmSync>[1]) => {
        if (String(targetPath).endsWith("flisk.exe.old")) {
          throw Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" });
        }
        rmSync(targetPath, opts);
      },
    ) as unknown as typeof rmSync;

    const removed = cleanupStaleUpgradeArtifacts(dir, {
      currentPid: 99999,
      isPidAlive: () => false,
      rmSync: mockRmSync,
    });

    expect(removed).toEqual([".flisk-upgrade-44444-1700000000000"]);
    expect(existsSync(join(dir, "flisk.exe.old"))).toBe(true);
    expect(existsSync(join(dir, ".flisk-upgrade-44444-1700000000000"))).toBe(false);
  });

  it("returns empty list when installDir does not exist", () => {
    expect(cleanupStaleUpgradeArtifacts(join(dir, "does-not-exist"))).toEqual([]);
  });

  it("cleans up beside a standalone binary and no-ops under node", () => {
    writeFileSync(join(dir, "flisk"), "current");
    writeFileSync(join(dir, "flisk.old"), "old");

    expect(cleanupRunningBinaryArtifacts("/usr/local/bin/node")).toEqual([]);
    expect(existsSync(join(dir, "flisk.old"))).toBe(true);

    const removed = cleanupRunningBinaryArtifacts(join(dir, "flisk"), {
      platformName: "darwin",
    });
    expect(removed).toEqual(["flisk.old"]);
    expect(existsSync(join(dir, "flisk.old"))).toBe(false);
  });
});
