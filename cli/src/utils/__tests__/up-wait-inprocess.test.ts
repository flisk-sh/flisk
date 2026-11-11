// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  it("does not turn a healthy stack into a failure when log cleanup is denied", async () => {
    const logFile = tempDir(); // A directory makes rmSync({ force: true }) fail.
    const child = fakeChild();
    const ready = '{"schemaVersion":1,"data":{"ok":true},"errors":[]}';
    const deps: UpWaitDeps = {
      spawnUp: () => child,
      readLog: () => ready,
      sleep: async () => {},
      now: () => 0,
      logFile: () => logFile,
    };
    expect(await upAndWait(["up"], 10, deps)).toEqual({ kind: "ready", json: ready });
  });

  it("removes a successful startup log while retaining a failed startup log", async () => {
    const dir = tempDir();
    const child = fakeChild();
    const ready = '{"schemaVersion":1,"data":{"ok":true},"errors":[]}';
    const failed = '{"schemaVersion":1,"data":{"ok":false},"errors":[{"code":"X"}]}';
    for (const [name, json, shouldRemain] of [
      ["ready.log", ready, false],
      ["failed.log", failed, true],
    ] as const) {
      const logFile = join(dir, name);
      const deps: UpWaitDeps = {
        spawnUp: () => {
          writeFileSync(logFile, `${json}\n`);
          return child;
        },
        readLog: (path) => readFileSync(path, "utf-8"),
        sleep: async () => {},
        now: () => 0,
        logFile: () => logFile,
      };
      const outcome = await upAndWait(["up"], 10, deps);
      expect(outcome.kind).toBe(shouldRemain ? "failed" : "ready");
      expect(existsSync(logFile)).toBe(shouldRemain);
    }
  });

  it("retains a timeout log for diagnosis", async () => {
    const logFile = join(tempDir(), "timed-out.log");
    const child = fakeChild();
    let clock = 0;
    writeFileSync(logFile, "waiting for database\n");
    const deps: UpWaitDeps = {
      spawnUp: () => child,
      readLog: (path) => readFileSync(path, "utf-8"),
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      logFile: () => logFile,
    };
    expect((await upAndWait(["up"], 1, deps)).kind).toBe("timeout");
    expect(existsSync(logFile)).toBe(true);
  });

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
    if (process.platform !== "win32") expect(statSync(logFile).mode & 0o777).toBe(0o600);
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
