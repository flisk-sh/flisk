// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WAIT_TIMEOUT_SECONDS,
  detachedUpArgs,
  failedWaitMessages,
  fetchUnhealthyLogLines,
  formatUnhealthyLogTails,
  parseWaitTimeout,
  UNHEALTHY_LINES_TOTAL,
  type UpWaitDeps,
  unhealthyLogTails,
  upAndWait,
  withUnhealthyLogs,
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

// #3823: a failed or timed-out wait shows the last lines of each unhealthy service's log, not only "not healthy".
describe("unhealthy services' log tails", () => {
  const line = (resource: string, text: string) => ({ resource, text });
  const pyLog = [
    line("py", "INFO:     Will watch for changes"),
    line("py", 'File "/app/services/app/py/src/main.py", line 1'),
    line("py", "boom: cannot connect to database at startup"),
  ];

  it("keeps the last five lines of each unhealthy service, in the order they appear", () => {
    const web = Array.from({ length: 8 }, (_, i) => line("web", `web line ${i + 1}`));
    expect(unhealthyLogTails([...pyLog, ...web])).toEqual([
      { name: "py", lines: pyLog.map((l) => l.text) },
      {
        name: "web",
        lines: ["web line 4", "web line 5", "web line 6", "web line 7", "web line 8"],
      },
    ]);
  });

  it("prints at most twenty lines in all and still names every service", () => {
    const many = Array.from({ length: 6 }, (_, s) =>
      Array.from({ length: 5 }, (_, i) => line(`svc${s}`, `svc${s} line ${i}`)),
    ).flat();
    const tails = unhealthyLogTails(many);
    expect(tails.map((t) => t.name)).toEqual(["svc0", "svc1", "svc2", "svc3", "svc4", "svc5"]);
    expect(tails.reduce((n, t) => n + t.lines.length, 0)).toBe(UNHEALTHY_LINES_TOTAL);
    expect(tails[4]?.lines).toEqual([]);
  });

  it("counts each line of a multi-line entry, such as a traceback, toward the caps", () => {
    const traceback = Array.from({ length: 8 }, (_, i) => `frame ${i + 1}`).join("\n");
    expect(
      unhealthyLogTails([line("py", `Traceback (most recent call last):\n${traceback}\r\n`)]),
    ).toEqual([{ name: "py", lines: ["frame 4", "frame 5", "frame 6", "frame 7", "frame 8"] }]);
  });

  it("skips blank lines and lines with no service", () => {
    expect(
      unhealthyLogTails([line("py", "   "), { resource: null, text: "tilt says hi" }]),
    ).toEqual([]);
  });

  it("formats each service with its lines and how to see more", () => {
    expect(formatUnhealthyLogTails(unhealthyLogTails(pyLog))).toEqual([
      "  py: not healthy",
      "    INFO:     Will watch for changes",
      '    File "/app/services/app/py/src/main.py", line 1',
      "    boom: cannot connect to database at startup",
      "    (last 3 lines of: flisk logs --service py)",
    ]);
    expect(formatUnhealthyLogTails([{ name: "web", lines: [] }])).toEqual([
      "  web: not healthy",
      "    (see: flisk logs --service web)",
    ]);
    expect(formatUnhealthyLogTails([])).toEqual([]);
  });

  it("adds the lines to the matching failure and the other unhealthy services as failures of their own", () => {
    const tails = unhealthyLogTails([...pyLog, line("web", "listening")]);
    expect(withUnhealthyLogs([{ name: "py", message: "health check is failing" }], tails)).toEqual([
      { name: "py", message: "health check is failing", logs: pyLog.map((l) => l.text) },
      { name: "web", message: "not healthy", logs: ["listening"] },
    ]);
    expect(withUnhealthyLogs([{ name: "api", message: "exit status 1" }], [])).toEqual([
      { name: "api", message: "exit status 1" },
    ]);
  });

  it("reads the lines from `flisk logs --unhealthy --json`", async () => {
    const envelope = JSON.stringify({ schemaVersion: 1, data: { lines: pyLog }, errors: [] });
    const script = `process.stdout.write(${JSON.stringify(`noise\n${envelope}\n`)})`;
    const lines = await fetchUnhealthyLogLines(() => [process.execPath, "-e", script]);
    expect(lines).toEqual(pyLog);
  });

  it("gives null when that command prints no result or fails", async () => {
    expect(
      await fetchUnhealthyLogLines(() => [process.execPath, "-e", "process.exit(3)"]),
    ).toBeNull();
    const noData = JSON.stringify({
      schemaVersion: 1,
      data: null,
      errors: [{ code: "X", message: "x" }],
    });
    expect(
      await fetchUnhealthyLogLines(() => [
        process.execPath,
        "-e",
        `console.log(${JSON.stringify(noData)})`,
      ]),
    ).toBeNull();
  });
});

describe("failedWaitMessages", () => {
  const tails = [{ name: "py", lines: ["boom"] }];

  it("puts a service's log lines under its own failure", () => {
    expect(
      failedWaitMessages(
        { data: { failures: [{ name: "py", message: "health check is failing" }] }, errors: [] },
        tails,
      ),
    ).toEqual([
      "py: health check is failing\n    boom\n    (last line of: flisk logs --service py)",
    ]);
  });

  it("keeps the error of a result with no service failures before the log lines", () => {
    expect(
      failedWaitMessages(
        {
          data: { failures: [] },
          errors: [{ message: "--env-file cannot change a stack that is already running" }],
        },
        tails,
      ),
    ).toEqual([
      "--env-file cannot change a stack that is already running",
      "py: not healthy\n    boom\n    (last line of: flisk logs --service py)",
    ]);
  });
});
