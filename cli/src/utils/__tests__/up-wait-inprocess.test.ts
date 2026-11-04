// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultUpWaitDeps, type UpWaitDeps, upAndWait } from "../up-wait.js";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: vi.fn(),
}));

function fakeChild(): ChildProcess {
  const child = new EventEmitter() as unknown as ChildProcess;
  (child as { unref: () => void }).unref = vi.fn();
  return child;
}

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "flisk-up-wait-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.mocked(spawn).mockReset();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("upAndWait", () => {
  it("reports a result line that is not valid JSON as a failure and lets the stack keep running", async () => {
    const child = fakeChild();
    const broken = '{"schemaVersion": 1, "data":';
    const deps: UpWaitDeps = {
      spawnUp: () => child,
      readLog: () => `starting\n${broken}\n`,
      sleep: async () => {},
      now: () => 0,
      logFile: () => "/tmp/up.log",
    };
    expect(await upAndWait(["up"], 60, deps)).toEqual({ kind: "failed", json: broken });
    expect(child.unref).toHaveBeenCalled();
  });
});

describe("defaultUpWaitDeps", () => {
  it("starts the invocation detached with the arguments, its output going to the log file", () => {
    const child = fakeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const dir = tempDir();
    const logFile = join(dir, "up.log");

    const deps = defaultUpWaitDeps(() => ["/usr/bin/bun", "/opt/flisk/cli.js"]);
    expect(deps.spawnUp(["up", "shop", "--json"], logFile, dir)).toBe(child);

    expect(spawn).toHaveBeenCalledTimes(1);
    const [command, args, options] = vi.mocked(spawn).mock.calls[0] as unknown as [
      string,
      string[],
      { cwd: string; detached: boolean; stdio: unknown[]; env: NodeJS.ProcessEnv },
    ];
    expect(command).toBe("/usr/bin/bun");
    expect(args).toEqual(["/opt/flisk/cli.js", "up", "shop", "--json"]);
    expect(options.cwd).toBe(dir);
    expect(options.detached).toBe(true);
    expect(options.stdio[0]).toBe("ignore");
    expect(typeof options.stdio[1]).toBe("number");
    expect(options.env.NO_COLOR).toBe("1");
    // The log file is opened for appending, so it exists even before the child writes to it.
    expect(readFileSync(logFile, "utf-8")).toBe("");
  });

  it("reads the log file, and an empty log when it does not exist yet", () => {
    const dir = tempDir();
    const logFile = join(dir, "up.log");
    const deps = defaultUpWaitDeps(() => ["flisk"]);
    expect(deps.readLog(logFile)).toBe("");
    writeFileSync(logFile, "line one\n");
    expect(deps.readLog(logFile)).toBe("line one\n");
  });

  it("sleeps, tells the time and names a log file in the temp folder", async () => {
    const deps = defaultUpWaitDeps(() => ["flisk"]);
    const before = Date.now();
    await deps.sleep(1);
    expect(deps.now()).toBeGreaterThanOrEqual(before);
    const logFile = deps.logFile();
    expect(logFile.startsWith(tmpdir())).toBe(true);
    expect(logFile).toMatch(/flisk-up-wait-\d+\.log$/);
  });
});
