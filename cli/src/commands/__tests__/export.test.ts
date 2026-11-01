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
    queueMicrotask(() =>
      outcome.error ? child.emit("error", outcome.error) : child.emit("close", outcome.code),
    );
    return child;
  }) as never;
  return { calls, spawnFn };
}

describe("flisk export", () => {
  it("runs the exporter from npm at an exact version, not from a git branch", () => {
    expect(EXPORT_PACKAGE).toMatch(/^@flisk-sh\/flisk-export@\d+\.\d+\.\d+$/);
  });

  it("lists the compose exporter (flisk-export 0.4.2) next to render and wrangler", () => {
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
      pkg: EXPORT_PACKAGE,
    });
    expect(exportInvocation(["render"], {}, "win32").command).toBe("npx.cmd");
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
    expect(command).toMatch(/^npx/);
    expect(args).toContain(EXPORT_PACKAGE);
    expect(args).toEqual(expect.arrayContaining(["render", "--resource", "api", "--dry-run"]));
    expect(args.filter((arg) => arg === "--dry-run")).toHaveLength(1);
    expect(options.stdio).toBe("inherit");
  });

  it("resolves to the exporter's exit code", async () => {
    const ok = fakeSpawn({ code: 0 });
    expect(await runExport(["render"], ok.spawnFn, {})).toBe(0);
    expect(ok.calls[0][1]).toEqual(["--yes", EXPORT_PACKAGE, "render"]);
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
      expect(String(error.mock.calls[0][0])).toContain("could not run npx (spawn npx ENOENT)");
    } finally {
      error.mockRestore();
    }
  });
});
