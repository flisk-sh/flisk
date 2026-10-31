// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// `flisk import tiltfile` runs flisk-import's `tiltfile` subcommand, like `compose`. The import itself (what it writes to
// .flisk/project.json and what it refuses) is tested in flisk-import; this file checks only what core forwards and reports.
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
  IMPORT_PACKAGE,
  importCommand,
  importFailure,
  importReport,
  TILTFILE_IMPORTER,
  tiltfileCommand,
} from "../import.js";

/** A spawn double whose child prints `stdout` and `stderr` through pipes (when piped), then closes with `code`. */
function fakeSpawn(outcome: { code?: number | null; stdout?: string; stderr?: string }) {
  const calls: unknown[][] = [];
  const spawnFn = (command: string, args: string[], options: unknown) => {
    calls.push([command, args, options]);
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });
    queueMicrotask(() => {
      if (outcome.stdout) child.stdout.emit("data", Buffer.from(outcome.stdout));
      if (outcome.stderr) child.stderr.emit("data", Buffer.from(outcome.stderr));
      child.emit("close", outcome.code);
    });
    return child;
  };
  return { calls, spawnFn };
}

/** What flisk-import forwards after `npx --yes <package>`. */
const forwarded = (calls: unknown[][]): string[] | undefined =>
  (calls[0]?.[1] as string[] | undefined)?.slice(2);

// In-process runs keep Commander's option values, so each case resets them.
function reset(): void {
  for (const name of ["yes", "force", "dryRun", "json"]) {
    importCommand.setOptionValue(name, false);
    tiltfileCommand.setOptionValue(name, false);
  }
}

async function run(args: string[], outcome: Parameters<typeof fakeSpawn>[0]) {
  reset();
  const { calls, spawnFn } = fakeSpawn(outcome);
  mocks.spawn.mockImplementation(spawnFn);
  const prevExitCode = process.exitCode;
  try {
    process.exitCode = undefined;
    const result = await runCommandInProcess(importCommand, args, createTempDir());
    // Without --json the importer's exit code is set on process.exitCode rather than passed to process.exit.
    return { calls, result, exitCode: process.exitCode };
  } finally {
    mocks.spawn.mockReset();
    process.exitCode = prevExitCode;
    reset();
  }
}

const IMPORTER_OUTPUT = [
  "Registering infra/Tiltfile as the orchestration source",
  "  wrote .flisk/project.json",
  "",
].join("\n");

describe("flisk import tiltfile", () => {
  describe("registration", () => {
    it("is a subcommand of import with its own description", () => {
      expect(importCommand.commands.find((c) => c.name() === "tiltfile")).toBe(tiltfileCommand);
      expect(tiltfileCommand.description()).toMatch(/Tiltfile/);
      expect(tiltfileCommand.description()).not.toBe(importCommand.description());
    });

    it("registers -y/--yes, -f/--force, --dry-run and --json, and leaves --help to flisk-import", () => {
      expect(tiltfileCommand.options.find((o) => o.long === "--yes")?.short).toBe("-y");
      expect(tiltfileCommand.options.find((o) => o.long === "--force")?.short).toBe("-f");
      expect(tiltfileCommand.options.find((o) => o.long === "--dry-run")).toBeDefined();
      expect(tiltfileCommand.options.find((o) => o.long === "--json")).toBeDefined();
      expect(tiltfileCommand.options.find((o) => o.long === "--help")).toBeUndefined();
    });
  });

  describe("forwarded arguments", () => {
    it("forwards tiltfile first, then the path and each flag once", () => {
      expect(buildForwardedImportArgs([TILTFILE_IMPORTER])).toEqual(["tiltfile"]);
      expect(
        buildForwardedImportArgs([TILTFILE_IMPORTER, "-y", "infra/Tiltfile", "-f"], {
          dryRun: true,
        }),
      ).toEqual(["tiltfile", "infra/Tiltfile", "--dry-run", "--yes", "--force"]);
      // A Tiltfile path that happens to be named like the Compose keyword is still the path.
      expect(buildForwardedImportArgs([TILTFILE_IMPORTER, "compose"])).toEqual([
        "tiltfile",
        "compose",
      ]);
    });

    it.each([
      { args: ["tiltfile"], expected: ["tiltfile"] },
      { args: ["tiltfile", "infra/Tiltfile"], expected: ["tiltfile", "infra/Tiltfile"] },
      { args: ["tiltfile", "--dry-run"], expected: ["tiltfile", "--dry-run"] },
      { args: ["tiltfile", "-y", "."], expected: ["tiltfile", ".", "--yes"] },
      { args: ["tiltfile", ".", "--force"], expected: ["tiltfile", ".", "--force"] },
      { args: ["--dry-run", "tiltfile"], expected: ["tiltfile", "--dry-run"] },
      { args: ["tiltfile", "--help"], expected: ["tiltfile", "--help"] },
    ])("runs npx flisk-import $expected for flisk import $args", async ({ args, expected }) => {
      const { calls, result } = await run(args, { code: 0 });
      expect(result.status).toBeUndefined();
      expect(calls).toHaveLength(1);
      expect((calls[0]?.[1] as string[] | undefined)?.slice(0, 2)).toEqual([
        "--yes",
        IMPORT_PACKAGE,
      ]);
      expect(forwarded(calls)).toEqual(expected);
      expect((calls[0]?.[2] as { stdio: unknown } | undefined)?.stdio).toBe("inherit");
    });

    it.each([1, 2])("exits with the importer's code %i", async (code) => {
      const { exitCode, result } = await run(["tiltfile"], { code });
      expect(result.status).toBeUndefined();
      expect(exitCode).toBe(code);
    });
  });

  describe("--json", () => {
    it("reads the path and the written files from the forwarded args and the importer's output", () => {
      expect(
        importReport(["tiltfile", "infra/Tiltfile", "--yes", "--force"], {
          exitCode: 0,
          stdout: IMPORTER_OUTPUT,
          stderr: "",
        }),
      ).toEqual({
        path: "infra/Tiltfile",
        dryRun: false,
        force: true,
        written: [".flisk/project.json"],
        output: IMPORTER_OUTPUT.trim(),
      });
      expect(
        importReport(["tiltfile", "--dry-run", "--yes"], {
          exitCode: 0,
          stdout: "Dry run: nothing written.",
          stderr: "",
        }),
      ).toMatchObject({ path: "Tiltfile", dryRun: true, written: [] });
    });

    it("prints one envelope with what the importer wrote and implies --yes", async () => {
      const { calls, result } = await run(["tiltfile", "infra/Tiltfile", "--json"], {
        code: 0,
        stdout: IMPORTER_OUTPUT,
      });
      expect(result.status).toBeUndefined();
      expect((calls[0]?.[2] as { stdio: unknown } | undefined)?.stdio).toEqual([
        "ignore",
        "pipe",
        "pipe",
      ]);
      expect(forwarded(calls)).toEqual(["tiltfile", "infra/Tiltfile", "--yes"]);
      expect(JSON.parse(result.stdout)).toEqual({
        schemaVersion: 1,
        data: {
          path: "infra/Tiltfile",
          dryRun: false,
          force: false,
          written: [".flisk/project.json"],
          output: IMPORTER_OUTPUT.trim(),
        },
        errors: [],
      });
      // The importer's text is for a person: it goes to stderr.
      expect(result.stderr).toContain("wrote .flisk/project.json");
    });

    it("forwards --dry-run --force with --json", async () => {
      const { calls, result } = await run(["tiltfile", "--dry-run", "--force", "--json"], {
        code: 0,
        stdout: "Dry run: nothing written.",
      });
      expect(forwarded(calls)).toEqual(["tiltfile", "--dry-run", "--yes", "--force"]);
      expect(JSON.parse(result.stdout).data).toEqual({
        path: "Tiltfile",
        dryRun: true,
        force: true,
        written: [],
        output: "Dry run: nothing written.",
      });
    });

    it.each([1, 2])(
      "maps an importer refusal with exit %i to an IMPORT_FAILED envelope with its message and hints",
      async (code) => {
        const { result } = await run(["tiltfile", "--json"], {
          code,
          stderr:
            "Error: .flisk/project.json already names an orchestration source (tiltfile: Tiltfile)\n  -> Pass --force to replace it\n",
        });
        expect(result.status).toBe(code);
        expect(JSON.parse(result.stdout)).toEqual({
          schemaVersion: 1,
          data: null,
          errors: [
            {
              code: "IMPORT_FAILED",
              message:
                ".flisk/project.json already names an orchestration source (tiltfile: Tiltfile)",
              suggestions: ["Pass --force to replace it"],
            },
          ],
        });
      },
    );

    it("suggests a tiltfile dry run when the importer gives no hint", () => {
      expect(
        importFailure(
          { exitCode: 1, stdout: "", stderr: "Error: Tiltfile not found at infra/Tiltfile\n" },
          "flisk import tiltfile",
        ),
      ).toMatchObject({
        message: "Tiltfile not found at infra/Tiltfile",
        suggestions: [
          "Run `flisk import tiltfile --dry-run` to see the plan without writing anything",
        ],
        exitCode: 1,
      });
    });
  });
});
