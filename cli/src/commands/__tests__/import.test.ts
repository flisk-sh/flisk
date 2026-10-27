// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: (...args: unknown[]) => mocks.spawn(...args),
}));

import { createTempDir, runCommandInProcess } from "../../test-support/index.js";
import {
  buildForwardedImportArgs,
  checkCoreVersion,
  compareSemver,
  IMPORT_PACKAGE,
  importCommand,
  importFailure,
  importInvocation,
  importReport,
  isVersionAtLeast,
  MIN_CORE_VERSION,
  parseSemver,
  RECOMMENDED_CORE_VERSION,
  runImport,
  runImportCaptured,
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
  it("forwards every argument, including flags, to flisk-import", () => {
    const inv = importInvocation([".", "--dry-run", "--force"], {}, "linux");
    expect(inv).toEqual({
      command: "npx",
      args: ["--yes", IMPORT_PACKAGE, ".", "--dry-run", "--force"],
      shell: false,
    });
  });

  it("runs the importer from npm at an exact version, not from a git branch", () => {
    expect(IMPORT_PACKAGE).toMatch(/^flisk-import@\d+\.\d+\.\d+$/);
  });

  it("advertises only flags the importer has", () => {
    const help = importCommand.registeredArguments.map((a) => a.description).join(" ");
    expect(help).toContain("--dry-run --yes --force");
    expect(help).not.toContain("--only");
    expect(importCommand.description()).not.toMatch(/procfile|dockerfile|package\.json/i);
  });

  it("honours FLISK_IMPORT_PACKAGE and uses npx.cmd on Windows", () => {
    const inv = importInvocation(["."], { FLISK_IMPORT_PACKAGE: "flisk-import@1" }, "win32");
    expect(inv.command).toBe("npx.cmd");
    expect(inv.args).toEqual(["--yes", "flisk-import@1", "."]);
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

  it("is registered as `import` and leaves --help to flisk-import", () => {
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
        mocks.spawn.mockImplementation(spawnFn);
        const prevExitCode = process.exitCode;

        try {
          await importCommand.parseAsync(["node", "flisk", ...commandArgs], { from: "node" });

          expect(calls).toHaveLength(1);
          const spawnedArgs = calls[0]?.[1] as string[];
          expect(spawnedArgs.slice(2)).toEqual(expectedForwarded);
        } finally {
          mocks.spawn.mockReset();
          process.exitCode = prevExitCode;
        }
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

    it("permits -h shorthand even on older core versions", () => {
      const check = checkCoreVersion("1.3.103", ["-h"]);
      expect(check.ok).toBe(true);
    });

    it("defaults to write check when no arguments are provided", () => {
      const check = checkCoreVersion("1.3.103");
      expect(check.ok).toBe(false);
      expect(check.message).toContain("flisk upgrade");
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

    it("resolves to exit code 1 when child process exits with null or undefined code", async () => {
      const { spawnFn: nullCodeSpawn } = fakeSpawn({ code: null });
      expect(await runImport(["."], nullCodeSpawn, () => "1.3.200")).toBe(1);

      const { spawnFn: undefinedCodeSpawn } = fakeSpawn({ code: undefined });
      expect(await runImport(["."], undefinedCodeSpawn, () => "1.3.200")).toBe(1);
    });
  });

  describe("parseSemver and compareSemver helpers", () => {
    it("parses valid semantic version strings correctly", () => {
      expect(parseSemver("1.2.3")).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: [],
      });
      expect(parseSemver("v2.4.6")).toEqual({
        major: 2,
        minor: 4,
        patch: 6,
        prerelease: [],
      });
      expect(parseSemver("1.2")).toEqual({
        major: 1,
        minor: 2,
        patch: 0,
        prerelease: [],
      });
      expect(parseSemver("1.0.0-alpha.1")).toEqual({
        major: 1,
        minor: 0,
        patch: 0,
        prerelease: ["alpha", 1],
      });
      expect(parseSemver("1.0.0+20130313144700")).toEqual({
        major: 1,
        minor: 0,
        patch: 0,
        prerelease: [],
      });
    });

    it("returns null for unparseable version strings", () => {
      expect(parseSemver("")).toBeNull();
      expect(parseSemver("   ")).toBeNull();
      expect(parseSemver("not-a-version")).toBeNull();
      expect(parseSemver("1.2.3.4")).toBeNull();
      expect(parseSemver("1.x.3")).toBeNull();
    });

    it("compares semver strings according to SemVer 2.0.0 specification", () => {
      // Major difference
      expect(compareSemver("2.0.0", "1.9.9")).toBe(1);
      expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);

      // Minor difference
      expect(compareSemver("1.5.0", "1.4.99")).toBe(1);
      expect(compareSemver("1.4.99", "1.5.0")).toBe(-1);

      // Patch difference
      expect(compareSemver("1.3.105", "1.3.104")).toBe(1);
      expect(compareSemver("1.3.104", "1.3.105")).toBe(-1);

      // Equal versions
      expect(compareSemver("1.3.104", "1.3.104")).toBe(0);

      // Prerelease comparison: normal version has higher precedence than prerelease
      expect(compareSemver("1.0.0", "1.0.0-alpha")).toBe(1);
      expect(compareSemver("1.0.0-alpha", "1.0.0")).toBe(-1);
      expect(compareSemver("1.0.0-alpha", "1.0.0-alpha")).toBe(0);

      // Prerelease identifiers comparison
      expect(compareSemver("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
      expect(compareSemver("1.0.0-beta", "1.0.0-alpha")).toBe(1);
      expect(compareSemver("1.0.0-1", "1.0.0-2")).toBe(-1);
      expect(compareSemver("1.0.0-2", "1.0.0-1")).toBe(1);
      expect(compareSemver("1.0.0-1", "1.0.0-alpha")).toBe(-1); // numeric has lower precedence than string
      expect(compareSemver("1.0.0-alpha", "1.0.0-1")).toBe(1); // string has higher precedence than numeric
      expect(compareSemver("1.0.0-alpha.1", "1.0.0-alpha")).toBe(1);
      expect(compareSemver("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1); // fewer prerelease components has lower precedence

      // Invalid inputs return null
      expect(compareSemver("invalid", "1.0.0")).toBeNull();
      expect(compareSemver("1.0.0", "invalid")).toBeNull();
    });

    it("validates that RECOMMENDED_CORE_VERSION is at least MIN_CORE_VERSION", () => {
      expect(isVersionAtLeast(RECOMMENDED_CORE_VERSION, MIN_CORE_VERSION)).toBe(true);
      expect(compareSemver(RECOMMENDED_CORE_VERSION, MIN_CORE_VERSION)).toBe(1);
    });
  });
});

/** A spawn double whose child prints `stdout` and `stderr` through pipes, then closes with `code` (or fails to start). */
function fakeCapturedSpawn(outcome: {
  code?: number | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
}) {
  const calls: unknown[][] = [];
  const spawnFn = ((command: string, args: string[], options: unknown) => {
    calls.push([command, args, options]);
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });
    queueMicrotask(() => {
      if (outcome.error) {
        child.emit("error", outcome.error);
        return;
      }
      if (outcome.stdout) child.stdout.emit("data", Buffer.from(outcome.stdout));
      if (outcome.stderr) child.stderr.emit("data", Buffer.from(outcome.stderr));
      child.emit("close", outcome.code);
    });
    return child;
  }) as never;
  return { calls, spawnFn };
}

const IMPORTER_OUTPUT = [
  "Plan for ./legacy (stack legacy):",
  "  api   create  services/legacy/api/service.json",
  "  wrote services/legacy/api/service.json",
  "  wrote services/legacy/worker/service.json",
  "",
  "Wrote 2 service.json file(s).",
  "",
].join("\n");

describe("flisk import --json", () => {
  it("runs the importer with piped output and no stdin, and resolves to what it printed", async () => {
    const { calls, spawnFn } = fakeCapturedSpawn({ code: 0, stdout: "out", stderr: "err" });
    expect(await runImportCaptured([".", "--yes"], spawnFn, () => "1.3.200")).toEqual({
      exitCode: 0,
      stdout: "out",
      stderr: "err",
    });
    expect((calls[0]?.[2] as { stdio: unknown } | undefined)?.stdio).toEqual([
      "ignore",
      "pipe",
      "pipe",
    ]);
  });

  it("reports the core version gate and a missing npx as runs, not throws", async () => {
    const gate = fakeCapturedSpawn({ code: 0 });
    const refused = await runImportCaptured([".", "--yes"], gate.spawnFn, () => "1.3.100");
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain("flisk upgrade");
    expect(gate.calls).toHaveLength(0);

    const missing = fakeCapturedSpawn({ error: new Error("ENOENT") });
    const run = await runImportCaptured(["."], missing.spawnFn, () => "1.3.200");
    expect(run.exitCode).toBe(127);
    expect(run.stderr).toContain("could not run npx (ENOENT)");
    expect(
      (await runImportCaptured(["."], fakeCapturedSpawn({ code: null }).spawnFn)).exitCode,
    ).toBe(1);
  });

  it("forwards a parsed --dry-run once", () => {
    expect(buildForwardedImportArgs(["./legacy"], { dryRun: true, yes: true })).toEqual([
      "./legacy",
      "--dry-run",
      "--yes",
    ]);
    expect(buildForwardedImportArgs(["--dry-run", "./legacy"], { dryRun: true })).toEqual([
      "--dry-run",
      "./legacy",
    ]);
  });

  it("reads the written files from the importer's 'wrote' lines", () => {
    expect(
      importReport(["./legacy", "--yes", "--force"], {
        exitCode: 0,
        stdout: IMPORTER_OUTPUT,
        stderr: "",
      }),
    ).toEqual({
      dir: "./legacy",
      dryRun: false,
      force: true,
      written: ["services/legacy/api/service.json", "services/legacy/worker/service.json"],
      output: IMPORTER_OUTPUT.trim(),
    });
    expect(
      importReport(["--dry-run", "--yes"], {
        exitCode: 0,
        stdout: "Dry run: nothing written.",
        stderr: "",
      }),
    ).toMatchObject({ dir: ".", dryRun: true, written: [] });
  });

  it("turns a failed run into IMPORT_FAILED with the importer's message, hints and exit code", () => {
    const error = importFailure({
      exitCode: 2,
      stdout: "",
      stderr: "Error: docker-compose.yml is not valid YAML\n  -> Fix line 3\n",
    });
    expect(error).toMatchObject({
      code: "IMPORT_FAILED",
      message: "docker-compose.yml is not valid YAML",
      suggestions: ["Fix line 3"],
      exitCode: 2,
    });
    expect(
      importFailure({
        exitCode: 1,
        stdout: "Plan\nNothing to import: no service in docker-compose.yml could be mapped.\n",
        stderr: "",
      }).message,
    ).toBe("Nothing to import: no service in docker-compose.yml could be mapped.");
    expect(importFailure({ exitCode: 127, stdout: "", stderr: "" })).toMatchObject({
      message: "flisk-import exited with code 127",
      suggestions: [expect.stringContaining("npx")],
    });
  });

  describe("the command", () => {
    // In-process runs keep Commander's option values, so each case resets the ones it sets.
    const reset = () => {
      for (const name of ["yes", "force", "dryRun", "json"])
        importCommand.setOptionValue(name, false);
    };

    it("prints one envelope with what the importer wrote and implies --yes", async () => {
      reset();
      const { calls, spawnFn } = fakeCapturedSpawn({ code: 0, stdout: IMPORTER_OUTPUT });
      mocks.spawn.mockImplementation(spawnFn);
      try {
        const result = await runCommandInProcess(
          importCommand,
          ["./legacy", "--json"],
          createTempDir(),
        );
        expect(result.status).toBeUndefined();
        expect((calls[0]?.[1] as string[] | undefined)?.slice(2)).toEqual(["./legacy", "--yes"]);
        expect(JSON.parse(result.stdout)).toEqual({
          schemaVersion: 1,
          data: {
            dir: "./legacy",
            dryRun: false,
            force: false,
            written: ["services/legacy/api/service.json", "services/legacy/worker/service.json"],
            output: IMPORTER_OUTPUT.trim(),
          },
          errors: [],
        });
        // The importer's text is for a person: it goes to stderr.
        expect(result.stderr).toContain("Wrote 2 service.json file(s).");
      } finally {
        mocks.spawn.mockReset();
        reset();
      }
    });

    it("prints an IMPORT_FAILED envelope and exits with the importer's code", async () => {
      reset();
      const { spawnFn } = fakeCapturedSpawn({
        code: 1,
        stdout: "Nothing to import: no service in docker-compose.yml could be mapped.\n",
      });
      mocks.spawn.mockImplementation(spawnFn);
      try {
        const result = await runCommandInProcess(
          importCommand,
          ["--dry-run", "--json"],
          createTempDir(),
        );
        expect(result.status).toBe(1);
        expect(JSON.parse(result.stdout)).toEqual({
          schemaVersion: 1,
          data: null,
          errors: [
            {
              code: "IMPORT_FAILED",
              message: "Nothing to import: no service in docker-compose.yml could be mapped.",
              suggestions: [
                "Run `flisk import --dry-run` to see the plan without writing anything",
              ],
            },
          ],
        });
      } finally {
        mocks.spawn.mockReset();
        reset();
      }
    });
  });
});
