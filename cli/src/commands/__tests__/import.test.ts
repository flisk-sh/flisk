// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  checkCoreVersion,
  IMPORT_PACKAGE,
  importCommand,
  importInvocation,
  isVersionAtLeast,
  MIN_CORE_VERSION,
  runImport,
} from "../import.js";

function fakeSpawn(outcome: { code?: number | null; error?: Error }) {
  const calls: unknown[][] = [];
  const spawnFn = ((command: string, args: string[], options: unknown) => {
    calls.push([command, args, options]);
    const child = new EventEmitter();
    queueMicrotask(() =>
      outcome.error ? child.emit("error", outcome.error) : child.emit("close", outcome.code),
    );
    return child;
  }) as never;
  return { calls, spawnFn };
}

describe("tdk import", () => {
  it("forwards every argument, including flags, to tdk-import", () => {
    const inv = importInvocation([".", "--dry-run", "--force"], {}, "linux");
    expect(inv).toEqual({
      command: "npx",
      args: ["--yes", IMPORT_PACKAGE, ".", "--dry-run", "--force"],
      shell: false,
    });
  });

  it("runs the importer from npm at an exact version, not from a git branch", () => {
    expect(IMPORT_PACKAGE).toMatch(/^@tdk-landscape\/tdk-import@\d+\.\d+\.\d+$/);
  });

  it("advertises only flags the importer has", () => {
    const help = importCommand.registeredArguments.map((a) => a.description).join(" ");
    expect(help).toContain("--dry-run --yes --force");
    expect(help).not.toContain("--only");
    expect(importCommand.description()).not.toMatch(/procfile|dockerfile|package\.json/i);
  });

  it("honours TDK_IMPORT_PACKAGE and uses npx.cmd on Windows", () => {
    const inv = importInvocation(["."], { TDK_IMPORT_PACKAGE: "tdk-import@1" }, "win32");
    expect(inv.command).toBe("npx.cmd");
    expect(inv.args).toEqual(["--yes", "tdk-import@1", "."]);
    expect(inv.shell).toBe(true);
  });

  it("passes the child's exit code through and inherits stdio", async () => {
    const { calls, spawnFn } = fakeSpawn({ code: 3 });
    expect(await runImport(["x"], spawnFn, () => "1.3.182")).toBe(3);
    expect((calls[0]?.[2] as { stdio: string } | undefined)?.stdio).toBe("inherit");
  });

  it("reports a missing npx with exit 127", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { spawnFn } = fakeSpawn({ error: new Error("ENOENT") });
    expect(await runImport([], spawnFn, () => "1.3.182")).toBe(127);
    expect(err).toHaveBeenCalledWith(expect.stringContaining("could not run npx"));
    err.mockRestore();
  });

  it("is registered as `import` and leaves --help to tdk-import", () => {
    expect(importCommand.name()).toBe("import");
    expect(importCommand.helpCommand).toBeDefined();
    expect(importCommand.options.find((o) => o.long === "--help")).toBeUndefined();
  });

  describe("core version gate", () => {
    it("compares semver versions accurately", () => {
      expect(isVersionAtLeast("1.3.104", MIN_CORE_VERSION)).toBe(true);
      expect(isVersionAtLeast("1.3.182", MIN_CORE_VERSION)).toBe(true);
      expect(isVersionAtLeast("1.4.0", MIN_CORE_VERSION)).toBe(true);
      expect(isVersionAtLeast("2.0.0", MIN_CORE_VERSION)).toBe(true);
      expect(isVersionAtLeast("1.3.103", MIN_CORE_VERSION)).toBe(false);
      expect(isVersionAtLeast("1.2.99", MIN_CORE_VERSION)).toBe(false);
      expect(isVersionAtLeast("invalid", MIN_CORE_VERSION)).toBe(false);
    });

    it("allows execution when core meets or exceeds MIN_CORE_VERSION", () => {
      const check = checkCoreVersion("1.3.104", ["."]);
      expect(check.ok).toBe(true);
      expect(check.message).toBeUndefined();
    });

    it("refuses writing when core is older than 1.3.104 and prints upgrade guidance", () => {
      const check = checkCoreVersion("1.3.103", [".", "--yes"]);
      expect(check.ok).toBe(false);
      expect(check.message).toContain("1.3.103");
      expect(check.message).toContain(MIN_CORE_VERSION);
      expect(check.message).toContain("tdk upgrade");
    });

    it("permits --dry-run even on older core versions since nothing is written", () => {
      const check = checkCoreVersion("1.3.103", [".", "--dry-run"]);
      expect(check.ok).toBe(true);
    });

    it("permits --help even on older core versions", () => {
      const check = checkCoreVersion("1.3.103", ["--help"]);
      expect(check.ok).toBe(true);
    });

    it("exits 1 without spawning when core version is below minimum", async () => {
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      const { calls, spawnFn } = fakeSpawn({ code: 0 });
      const exitCode = await runImport([".", "--yes"], spawnFn, () => "1.3.100");
      expect(exitCode).toBe(1);
      expect(calls).toHaveLength(0);
      expect(err).toHaveBeenCalledWith(expect.stringContaining("tdk upgrade"));
      err.mockRestore();
    });
  });
});
