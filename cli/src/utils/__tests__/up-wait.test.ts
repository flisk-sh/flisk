// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WAIT_TIMEOUT_SECONDS,
  detachedUpArgs,
  parseWaitTimeout,
  type UpWaitDeps,
  upAndWait,
} from "../up-wait.js";

const READY = JSON.stringify({
  schemaVersion: 1,
  data: { ok: true, tiltUrl: "http://localhost:10350" },
  errors: [],
});
const FAILED = JSON.stringify({
  schemaVersion: 1,
  data: { ok: false, failures: [{ name: "quiz-web", message: "health check is failing" }] },
  errors: [{ code: "UP_RESOURCE_FAILED", message: "Resources failed" }],
});

/** A fake detached child and a fake clock: the log grows by `steps` as time passes. */
function harness(steps: Array<{ at: number; log?: string; exit?: number; error?: Error }>) {
  let clock = 0;
  let log = "";
  const child = new EventEmitter() as unknown as ChildProcess;
  (child as { unref: () => void }).unref = () => {};
  const spawned: string[][] = [];
  const deps: UpWaitDeps = {
    spawnUp: (args) => {
      spawned.push(args);
      return child;
    },
    readLog: () => log,
    sleep: async (ms) => {
      clock += ms;
      for (const step of steps.filter((s) => s.at <= clock)) {
        if (step.log) log += step.log;
        if (step.exit !== undefined) child.emit("exit", step.exit);
        if (step.error) child.emit("error", step.error);
      }
      steps = steps.filter((s) => s.at > clock);
    },
    now: () => clock,
    logFile: () => "/tmp/up.log",
  };
  return { deps, spawned };
}

describe("detachedUpArgs", () => {
  it("drops the wait options and asks for one JSON result", () => {
    expect(detachedUpArgs(["up", "shop", "--wait", "--wait-timeout", "90", "--only=api"])).toEqual([
      "up",
      "shop",
      "--only=api",
      "--json",
    ]);
    expect(detachedUpArgs(["up", "--wait-timeout=90", "--wait"])).toEqual(["up", "--json"]);
  });

  it("does not add --json twice", () => {
    expect(detachedUpArgs(["up", "--json", "--wait"])).toEqual(["up", "--json"]);
  });
});

describe("parseWaitTimeout", () => {
  it("defaults, accepts whole seconds and rejects anything else", () => {
    expect(parseWaitTimeout(undefined)).toEqual({
      ok: true,
      seconds: DEFAULT_WAIT_TIMEOUT_SECONDS,
    });
    expect(parseWaitTimeout("90")).toEqual({ ok: true, seconds: 90 });
    for (const bad of ["0", "-5", "1.5", "abc", "21601"]) {
      expect(parseWaitTimeout(bad).ok).toBe(false);
    }
  });
});

describe("upAndWait", () => {
  it("returns ready with the JSON result once the stack is healthy", async () => {
    const { deps, spawned } = harness([{ at: 1000, log: `noise\n${READY}\n` }]);
    const outcome = await upAndWait(["up", "--wait"], 60, deps);
    expect(outcome).toEqual({ kind: "ready", json: READY });
    expect(spawned[0]).toEqual(["up", "--json"]);
  });

  it("returns failed with the unhealthy service names when up reports a failure", async () => {
    const { deps } = harness([{ at: 500, log: `${FAILED}\n` }]);
    const outcome = await upAndWait(["up"], 60, deps);
    expect(outcome.kind).toBe("failed");
    expect(outcome.kind === "failed" && outcome.json).toContain("quiz-web");
  });

  it("times out, keeps the log tail and says where the log is", async () => {
    const { deps } = harness([{ at: 500, log: "building web\n" }]);
    const outcome = await upAndWait(["up"], 2, deps);
    expect(outcome).toEqual({ kind: "timeout", logTail: "building web\n", logFile: "/tmp/up.log" });
  });

  it("reports an exit before any result as exited", async () => {
    const { deps } = harness([{ at: 250, log: "Docker is not running\n", exit: 1 }]);
    const outcome = await upAndWait(["up"], 60, deps);
    expect(outcome).toEqual({ kind: "exited", exitCode: 1, logTail: "Docker is not running\n" });
  });

  it("reports a child that cannot start", async () => {
    const { deps } = harness([{ at: 250, error: new Error("spawn ENOENT") }]);
    const outcome = await upAndWait(["up"], 60, deps);
    expect(outcome).toEqual({ kind: "spawn-error", message: "spawn ENOENT" });
  });
});
