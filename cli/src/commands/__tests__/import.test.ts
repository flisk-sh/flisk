// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  buildForwardedImportArgs,
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

describe("flisk import", () => {
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

  it("registers -y/--yes and --force options with the shared convention", () => {
    const yesOpt = importCommand.options.find((o) => o.long === "--yes");
    expect(yesOpt?.short).toBe("-y");
    const forceOpt = importCommand.options.find((o) => o.long === "--force");
    expect(forceOpt).toBeDefined();
    expect(forceOpt?.short).toBe("-f");
  });

  describe("forwarded arguments contract", () => {
    it("forwards parsed options authoritatively without duplicate flags", () => {
      expect(buildForwardedImportArgs(["./services"], { yes: true })).toEqual([
        "./services",
        "--yes",
      ]);
      expect(buildForwardedImportArgs(["./services"], { force: true })).toEqual([
        "./services",
        "--force",
      ]);
      expect(buildForwardedImportArgs(["./services"], { yes: true, force: true })).toEqual([
        "./services",
        "--yes",
        "--force",
      ]);
    });

    it("strips flags placed before or after directory from positional args so flags are forwarded exactly once", () => {
      // Flag before directory
      expect(buildForwardedImportArgs(["--yes", "./services"], { yes: true })).toEqual([
        "./services",
        "--yes",
      ]);
      // Flag after directory
      expect(buildForwardedImportArgs(["./services", "--yes"], { yes: true })).toEqual([
        "./services",
        "--yes",
      ]);
      // Short form -y in positional args normalized by option
      expect(buildForwardedImportArgs(["-y", "./services"], { yes: true })).toEqual([
        "./services",
        "--yes",
      ]);
      // Short form -y alone in args without options
      expect(buildForwardedImportArgs(["./services", "-y"])).toEqual(["./services", "--yes"]);
      // Short form -f alone in args without options
      expect(buildForwardedImportArgs(["./services", "-f"])).toEqual(["./services", "--force"]);
      // Long form --force in args without options
      expect(buildForwardedImportArgs(["--force", "./services"])).toEqual([
        "./services",
        "--force",
      ]);
      // Mixed short and long forms with --force
      expect(
        buildForwardedImportArgs(["-y", "./services", "--force"], { yes: true, force: true }),
      ).toEqual(["./services", "--yes", "--force"]);
      // Mixed flags in args without options
      expect(buildForwardedImportArgs(["-y", "./services", "-f"])).toEqual([
        "./services",
        "--yes",
        "--force",
      ]);
      // Flags after directory
      expect(buildForwardedImportArgs(["./services", "-y", "-f"])).toEqual([
        "./services",
        "--yes",
        "--force",
      ]);
      // Preserves pass-through options like --dry-run
      expect(buildForwardedImportArgs(["--dry-run", "./services", "-y"])).toEqual([
        "--dry-run",
        "./services",
        "--yes",
      ]);
      // Deduplicates multiple occurrences of flags in args
      expect(buildForwardedImportArgs(["-y", "--yes", "./services", "-f", "--force"])).toEqual([
        "./services",
        "--yes",
        "--force",
      ]);
    });
  });

  describe("importCommand CLI argument parsing and execution", () => {
    it.each([
      { commandArgs: ["--yes", "."], expectedForwarded: [".", "--yes"] },
      { commandArgs: [".", "-y"], expectedForwarded: [".", "--yes"] },
      { commandArgs: ["--force", "."], expectedForwarded: [".", "--force"] },
      { commandArgs: [".", "-f"], expectedForwarded: [".", "--force"] },
      { commandArgs: ["-y", ".", "-f"], expectedForwarded: [".", "--yes", "--force"] },
      { commandArgs: [".", "-y", "-f"], expectedForwarded: [".", "--yes", "--force"] },
      { commandArgs: ["--force", "--yes", "."], expectedForwarded: [".", "--yes", "--force"] },
    ])(
      "normalizes flags regardless of position or alias for $commandArgs",
      async ({ commandArgs, expectedForwarded }) => {
        importCommand.setOptionValue("yes", false);
        importCommand.setOptionValue("force", false);

        const { calls, spawnFn } = fakeSpawn({ code: 0 });
        const argsParsed: string[] = [];
        const optsParsed: { yes?: boolean; force?: boolean } = {};

        // Parse using commander instance to extract args and options
        const testCmd = importCommand.action(async (args, options) => {
          argsParsed.push(...args);
          Object.assign(optsParsed, options);
          const forwarded = buildForwardedImportArgs(args, options);
          await runImport(forwarded, spawnFn, () => "1.3.183");
        });

        await testCmd.parseAsync(["node", "flisk", ...commandArgs], { from: "node" });

        expect(calls).toHaveLength(1);
        const spawnedArgs = calls[0]?.[1] as string[];
        expect(spawnedArgs.slice(2)).toEqual(expectedForwarded);
      },
    );
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
      // Prerelease handling (CodeRabbit review): 1.3.104-rc.1 is strictly less than 1.3.104
      expect(isVersionAtLeast("1.3.104-rc.1", MIN_CORE_VERSION)).toBe(false);
      expect(isVersionAtLeast("1.3.104-alpha", MIN_CORE_VERSION)).toBe(false);
      expect(isVersionAtLeast("1.3.105-rc.1", MIN_CORE_VERSION)).toBe(true);
      expect(isVersionAtLeast("1.4.0-rc.1", MIN_CORE_VERSION)).toBe(true);
      expect(isVersionAtLeast("1.3.104+build123", MIN_CORE_VERSION)).toBe(true);
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
      expect(check.message).toContain("flisk upgrade");
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
      expect(err).toHaveBeenCalledWith(expect.stringContaining("flisk upgrade"));
      err.mockRestore();
    });
  });
});
