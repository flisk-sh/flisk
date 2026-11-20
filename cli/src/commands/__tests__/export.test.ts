// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: (...args: unknown[]) => mocks.spawn(...args),
}));

import { createTempDir, npxArgs, runCommandInProcess } from "../../test-support/index.js";
import {
  buildForwardedExportArgs,
  EXPORT_PACKAGE,
  exportCommand,
  exportInvocation,
  runExport,
} from "../export.js";

function fakeSpawn(outcome: { code?: number | null; error?: Error }) {
  const calls: unknown[][] = [];
  const spawnFn = ((command: string, args: string[], options: unknown) => {
    calls.push([command, args, options]);
    const child = new EventEmitter();
    queueMicrotask(() => {
      if (outcome.error) {
        child.emit("error", outcome.error);
        child.emit("close", -2);
        return;
      }
      child.emit("close", outcome.code);
    });
    return child;
  }) as never;
  return { calls, spawnFn };
}

/** Runs a check with a PATH that contains only the named fake programs (#3744). */
async function withSimulatedPath<T>(programs: string[], fn: () => T | Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-runner-path-"));
  for (const program of programs) fs.writeFileSync(path.join(dir, program), "");
  const original = process.env.PATH;
  process.env.PATH = dir;
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env.PATH;
    else process.env.PATH = original;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("flisk export", () => {
  it("runs the exporter from npm at an exact version, not from a git branch", () => {
    expect(EXPORT_PACKAGE).toMatch(/^@flisk-sh\/flisk-export@\d+\.\d+\.\d+$/);
  });

  it("lists the compose exporter (flisk-export 0.5.0) next to render and wrangler", () => {
    expect(exportCommand.description()).toContain("docker-compose.yml");
    const usage = exportCommand.registeredArguments[0]?.description ?? "";
    expect(usage).toContain("render [dir]");
    expect(usage).toContain("wrangler [dir]");
    expect(usage).toContain("compose [dir]");
  });

  it("forwards every argument, including flags, to flisk-export", () => {
    const args = ["wrangler", "--resource", "edge", "--route", "api.example.com", "--force"];
    expect(exportInvocation(args, {}, "linux")).toEqual({
      command: "npx",
      args: ["--yes", EXPORT_PACKAGE, ...args],
      shell: false,
      windowsVerbatimArguments: false,
      pkg: EXPORT_PACKAGE,
    });
  });

  it("uses npx when it is on PATH, even when bunx is too", async () => {
    await withSimulatedPath(["npx", "bunx"], () => {
      const inv = exportInvocation(["render"], {}, "linux");
      expect(inv.command).toBe("npx");
      expect(inv.args.slice(0, 2)).toEqual(["--yes", EXPORT_PACKAGE]);
    });
  });

  it("uses bunx without --yes when only bunx is on PATH (#3744)", async () => {
    await withSimulatedPath(["bunx"], () => {
      expect(exportInvocation(["compose", "--dry-run"], {}, "linux")).toEqual({
        command: "bunx",
        args: [EXPORT_PACKAGE, "compose", "--dry-run"],
        shell: false,
        windowsVerbatimArguments: false,
        pkg: EXPORT_PACKAGE,
      });
    });
  });

  it("uses bunx.cmd through cmd.exe on Windows when npx is absent (#3744)", async () => {
    await withSimulatedPath(["bunx"], () => {
      const inv = exportInvocation(["a&b"], {}, "win32", {
        execPath: "C:\\tools\\flisk.exe",
        comSpec: "cmd.exe",
      });
      expect(inv.command).toBe("cmd.exe");
      expect(inv.windowsVerbatimArguments).toBe(true);
      expect(inv.args[3]).toContain("bunx.cmd");
      expect(inv.args[3]).toContain("a^^^&b");
    });
  });

  it("keeps npx as the fallback when no runner is on PATH", async () => {
    await withSimulatedPath([], () => {
      const inv = exportInvocation(["render"], {}, "linux");
      expect(inv.command).toBe("npx");
      expect(inv.args[0]).toBe("--yes");
    });
  });

  it("on Windows passes a path with a space and an ampersand to npx without a shell (#4004)", () => {
    const nodeExe = "C:\\Program Files\\nodejs\\node.exe";
    const npxCli = "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js";
    const args = ["render", "C:\\Users\\Jane Smith\\shop", "--out", "build&out"];
    expect(
      exportInvocation(args, {}, "win32", { execPath: nodeExe, exists: (p) => p === npxCli }),
    ).toEqual({
      command: nodeExe,
      args: [npxCli, "--yes", EXPORT_PACKAGE, ...args],
      shell: false,
      windowsVerbatimArguments: false,
      pkg: EXPORT_PACKAGE,
    });
  });

  it("lets FLISK_EXPORT_PACKAGE override the pinned package", () => {
    const inv = exportInvocation(["render"], { FLISK_EXPORT_PACKAGE: "./local.tgz" }, "linux");
    expect(inv.args).toEqual(["--yes", "./local.tgz", "render"]);
  });

  it("passes --dry-run through once", () => {
    expect(buildForwardedExportArgs(["render"], { dryRun: true })).toEqual(["render", "--dry-run"]);
    expect(buildForwardedExportArgs(["render", "--dry-run"], { dryRun: true })).toEqual([
      "render",
      "--dry-run",
    ]);
    expect(buildForwardedExportArgs(["render"], {})).toEqual(["render"]);
  });

  it("runs the command through npx with the terminal and its arguments", async () => {
    const dir = createTempDir();
    mocks.spawn.mockImplementation(fakeSpawn({ code: 0 }).spawnFn);
    const result = await runCommandInProcess(
      exportCommand,
      ["render", "--resource", "api", "--dry-run"],
      dir,
    );
    expect(result.status ?? 0).toBe(0);
    const [command, args, options] = mocks.spawn.mock.calls.at(-1) as [
      string,
      string[],
      { stdio: string },
    ];
    expect(command).toMatch(/npx|node/i);
    expect(npxArgs(args).slice(0, 2)).toEqual(["--yes", EXPORT_PACKAGE]);
    expect(args).toEqual(expect.arrayContaining(["render", "--resource", "api", "--dry-run"]));
    expect(args.filter((arg) => arg === "--dry-run")).toHaveLength(1);
    expect(options.stdio).toBe("inherit");
  });

  it("resolves to the exporter's exit code", async () => {
    const ok = fakeSpawn({ code: 0 });
    expect(await runExport(["render"], ok.spawnFn, {})).toBe(0);
    expect(npxArgs(ok.calls[0][1] as string[])).toEqual(["--yes", EXPORT_PACKAGE, "render"]);
  });

  it("says the package may be unavailable when the exporter exits non-zero", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failed = fakeSpawn({ code: 1 });
      expect(await runExport(["render"], failed.spawnFn, {})).toBe(1);
      const printed = error.mock.calls.map((call) => String(call[0])).join("\n");
      expect(printed).toContain(`${EXPORT_PACKAGE} exited with code 1`);
      expect(printed).toContain("could not download it");
    } finally {
      error.mockRestore();
    }
  });

  it("exits 127 with an install hint when npx cannot be run", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const missing = fakeSpawn({ error: new Error("spawn npx ENOENT") });
      expect(await runExport(["render"], missing.spawnFn, {})).toBe(127);
      expect(String(error.mock.calls[0][0])).toContain(
        "could not run npx or bunx (spawn npx ENOENT). Install Node.js (npx) or Bun (bunx)",
      );
      // A failed spawn still emits close afterwards; that must not print the unavailable hint too.
      expect(error.mock.calls).toHaveLength(1);
    } finally {
      error.mockRestore();
    }
  });
});
