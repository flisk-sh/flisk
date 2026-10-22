// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempDir } from "../../test-support/temp-project.js";

const dirs = vi.hoisted(() => ({ home: "", cwd: "" }));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => dirs.home };
});

vi.mock("node:process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:process")>();
  return { ...actual, cwd: () => dirs.cwd };
});

// Skip the machine checks and the global install.
vi.mock("../../utils/cold-preflight.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/cold-preflight.js")>()),
  runColdPreflight: vi.fn(),
  formatColdPreflight: vi.fn(() => ""),
  assertMachineReadyOrExit: vi.fn(async () => {}),
  detectRuntimePrerequisites: vi.fn(() => ({})),
  formatRuntimeNextSteps: vi.fn(() => ""),
}));

vi.mock("../../utils/cli-command.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/cli-command.js")>()),
  ensureGlobalInstall: vi.fn(() => "already-installed"),
}));

vi.mock("../../utils/colima.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/colima.js")>()),
  checkColima: vi.fn(() => ({ isColima: false, running: true })),
}));

// A "stack already running" makes cli.ts open the frontend and exit(0), so the
// setup, install and Tilt steps never run.
vi.mock("../open.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../open.js")>()),
  findReadyFrontend: vi.fn(async () => ({ name: "web" })),
  openFirstFrontend: vi.fn(async () => ({})),
}));

// Replace only the clone: it creates a fake project instead of touching the network.
vi.mock("../project.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../project.js")>()),
  cloneProjectTemplate: vi.fn(async (_template: string, target: string) => {
    const destination = isAbsolute(target) ? target : resolve(dirs.cwd, target);
    mkdirSync(join(destination, ".tdk"), { recursive: true });
    writeFileSync(join(destination, ".tdk", "project.json"), "{}\n");
  }),
}));

class ExitSignal extends Error {
  constructor(readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

const originalArgv = process.argv;

vi.setConfig({ testTimeout: 30_000 });

/** Runs cli.ts from scratch with the given arguments and returns the exit code. */
async function runDemoCli(...args: string[]): Promise<number | undefined> {
  vi.resetModules();
  process.argv = [originalArgv[0], "/fake/bin/tdk.js", ...args];

  try {
    await import("../../cli.js");
  } catch (error) {
    if (error instanceof ExitSignal) return error.code;
    throw error;
  }

  return undefined;
}

describe("flisk demo fixed directory", () => {
  let demoDir: string;

  beforeEach(() => {
    dirs.home = createTempDir("flisk-home-");
    dirs.cwd = createTempDir("flisk-cwd-");
    demoDir = join(dirs.home, ".flisk", "flisk-demo");

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new ExitSignal(code);
    }) as never);
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it("creates ~/.flisk/flisk-demo on the first run", async () => {
    expect(existsSync(demoDir)).toBe(false);

    expect(await runDemoCli("demo")).toBe(0);

    expect(existsSync(join(demoDir, ".tdk", "project.json"))).toBe(true);
  });

  it("removes the previous directory and creates a fresh one on the second run", async () => {
    expect(await runDemoCli("demo")).toBe(0);

    const marker = join(demoDir, "stale-marker.txt");
    writeFileSync(marker, "left over from the first run");

    expect(await runDemoCli("demo")).toBe(0);

    expect(existsSync(marker)).toBe(false);
    expect(existsSync(join(demoDir, ".tdk", "project.json"))).toBe(true);
  });

  it("puts the demo in the home directory, not the current working directory", async () => {
    expect(await runDemoCli("demo")).toBe(0);

    expect(existsSync(demoDir)).toBe(true);
    expect(readdirSync(dirs.cwd)).toEqual([]);
  });

  it.each(["restaurant", "saas"])(
    "%s still uses the current working directory",
    async (template) => {
      expect(await runDemoCli(template)).toBe(0);

      expect(readdirSync(dirs.cwd)).toHaveLength(1);
      expect(existsSync(join(dirs.home, ".flisk"))).toBe(false);
    },
  );
});
