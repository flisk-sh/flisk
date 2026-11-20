// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { SpawnSyncReturns } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { makeResource } from "../../test-support/index.js";
import type { DiscoveredResource } from "../../types/index.js";
import type { RunTarget } from "../run.js";
import { resolveServiceTestCommand, runServiceTests, splitTestCommand } from "../test.js";

function fakeTarget(service: string, file = "bun", args: string[] = []): RunTarget {
  return {
    service,
    runtime: "native",
    file,
    args,
    cwd: `/tmp/${service}`,
    env: { FLISK_TEST: "1" },
  };
}

function fakeProcess(stdout: string, stderr: string, status: number): SpawnSyncReturns<string> {
  return {
    pid: 1,
    output: [null, stdout, stderr],
    stdout,
    stderr,
    status,
    signal: null,
    error: undefined,
  } as SpawnSyncReturns<string>;
}

describe("service test-command resolution", () => {
  it("reads only the service's `test` field and trims it", () => {
    expect(
      resolveServiceTestCommand(makeResource("api", "backend", { test: "  bun test  " })),
    ).toBe("bun test");
  });

  it("does not treat another field as a test-command alias", () => {
    expect(
      resolveServiceTestCommand(
        makeResource("api", "backend", {
          command: "node server.js",
          dev: { command: "nodemon server.js", testOnSave: true },
        }),
      ),
    ).toBeNull();
    expect(resolveServiceTestCommand(makeResource("api", "backend", { test: 42 }))).toBeNull();
    expect(resolveServiceTestCommand(makeResource("api", "backend", { test: "   " }))).toBeNull();
  });

  it("splits a declared command into a program and its arguments", () => {
    expect(splitTestCommand('bun test --filter "api tests"')).toEqual([
      "bun",
      "test",
      "--filter",
      "api tests",
    ]);
  });
});

describe("flisk test runner", () => {
  const resources: DiscoveredResource[] = [
    makeResource("api", "backend", { stack: "main", test: "bun test" }),
    makeResource("worker", "worker", { stack: "main", test: "node fail.js" }),
    makeResource("db", "database", { stack: "main" }),
    makeResource("other", "backend", { stack: "other", test: "bun test" }),
  ];

  it("runs each declared command through the run target and reports every service", async () => {
    const resolveTarget = vi.fn((_root: string, service: string, command: string[]) =>
      fakeTarget(service, command[0], command.slice(1)),
    );
    const execute = vi.fn((target: RunTarget) =>
      target.service === "worker" ? fakeProcess("", "boom\n", 1) : fakeProcess("ok\n", "", 0),
    );
    const now = vi.fn(() => 1_000);

    const result = await runServiceTests("/tmp/project", {
      stack: "main",
      resources,
      resolveTarget,
      execute,
      now,
    });

    expect(result.ok).toBe(false);
    expect(result.stack).toBe("main");
    expect(result.results).toHaveLength(3);
    expect(result.results[0]).toEqual({
      service: "api",
      command: "bun test",
      ok: true,
      status: "passed",
      durationMs: 0,
      outputTail: "ok\n",
    });
    expect(result.results[1]).toEqual({
      service: "worker",
      command: "node fail.js",
      ok: false,
      status: "failed",
      durationMs: 0,
      outputTail: "boom\n",
    });
    expect(result.results[2]).toEqual({
      service: "db",
      command: null,
      ok: null,
      status: "skipped",
      durationMs: 0,
      outputTail: "",
    });
    expect(result.summary).toEqual({ passed: 1, failed: 1, skipped: 1 });

    expect(resolveTarget).toHaveBeenCalledTimes(2);
    expect(resolveTarget).toHaveBeenCalledWith("/tmp/project", "api", ["bun", "test"], {
      interactive: false,
      resources,
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ service: "api", env: { FLISK_TEST: "1" } }),
    );
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("refuses an unknown stack", async () => {
    await expect(
      runServiceTests("/tmp/project", {
        stack: "missing",
        resources,
        resolveTarget: vi.fn(),
        execute: vi.fn(),
      }),
    ).rejects.toThrow(/Stack "missing" not found/);
  });

  it("bounds the output tail for a noisy test command", async () => {
    const noise = "x".repeat(100_000);
    const result = await runServiceTests("/tmp/project", {
      resources: [makeResource("api", "backend", { stack: "main", test: "bun test" })],
      resolveTarget: vi.fn((_root: string, service: string) => fakeTarget(service)),
      execute: vi.fn(() => fakeProcess(noise, "", 0)),
    });

    expect(result.ok).toBe(true);
    expect(result.results[0]?.ok).toBe(true);
    expect(result.results[0]?.outputTail.length).toBeLessThanOrEqual(64 * 1024);
    expect(result.results[0]?.outputTail.endsWith("x")).toBe(true);
  });
});
