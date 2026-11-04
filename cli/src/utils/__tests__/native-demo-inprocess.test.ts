// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempDir } from "../../test-support/index.js";
import { createDemoStage, type DemoStage } from "../demo-stage.js";
import {
  containerDemoProblem,
  runNativeDemo,
  runningNativeDemoUrl,
  startNativeDemo,
} from "../native-demo.js";
import { isPortListening, nativeRunStatePath } from "../native-runtime.js";
import { openUrl } from "../url-actions.js";
import { findOnPath } from "../which.js";

// Neither Docker nor `flisk up` is ever started: execFile and spawn are faked, so each case says what they do.
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("../which.js", () => ({ findOnPath: vi.fn() }));
vi.mock("../url-actions.js", () => ({ openUrl: vi.fn(async () => true) }));

vi.mock("../native-runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../native-runtime.js")>()),
  isPortListening: vi.fn(async () => false),
}));

vi.mock("../demo-stage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../demo-stage.js")>()),
  createDemoStage: vi.fn(),
}));

let stage: { [K in keyof DemoStage]: ReturnType<typeof vi.fn> };
let logs: string[];

/** A child that runs `onSpawn` shortly after it starts, like a real process writing its log or exiting. */
function fakeChild(onSpawn: (child: EventEmitter) => void) {
  const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
  setTimeout(() => onSpawn(child), 5);
  return child;
}

function logPathOf(dir: string): string {
  return join(dir, ".flisk", "demo-native.log");
}

function writeRunState(dir: string, pid: number, web: Record<string, unknown> | undefined) {
  const path = nativeRunStatePath(dir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ pid, startedAt: "now", services: web ? { web } : {} }));
}

beforeEach(() => {
  stage = { update: vi.fn(), fail: vi.fn(), finish: vi.fn(), stop: vi.fn() };
  vi.mocked(createDemoStage).mockReturnValue(stage as unknown as DemoStage);
  vi.mocked(isPortListening).mockResolvedValue(false);
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...line: unknown[]) => {
    logs.push(line.map(String).join(" "));
  });
});

afterEach(() => {
  vi.mocked(spawn).mockReset();
  vi.mocked(execFile).mockReset();
  vi.mocked(openUrl).mockClear();
  vi.restoreAllMocks();
  process.exitCode = 0;
});

describe("containerDemoProblem with the default probe", () => {
  it("runs docker info and docker compose version, and names the missing Compose plugin", async () => {
    vi.mocked(findOnPath).mockImplementation((command) => `/usr/bin/${command}`);
    vi.mocked(execFile).mockImplementation(((
      _file: string,
      args: string[],
      _options: unknown,
      callback: (error: Error | null) => void,
    ) => {
      callback(args[0] === "info" ? null : new Error("no compose"));
    }) as never);
    await expect(containerDemoProblem()).resolves.toBe(
      "the Docker Compose plugin is not installed",
    );
    const calls = vi.mocked(execFile).mock.calls.map((call) => [call[0], call[1]]);
    expect(calls).toEqual([
      ["docker", ["info"]],
      ["docker", ["compose", "version"]],
    ]);
    expect(vi.mocked(execFile).mock.calls[0]?.[2]).toMatchObject({ timeout: 10_000 });
  });

  it("reports Docker as not installed when it is not on PATH", async () => {
    vi.mocked(findOnPath).mockReturnValue(null);
    await expect(containerDemoProblem()).resolves.toBe("Docker is not installed");
    expect(execFile).not.toHaveBeenCalled();
  });
});

describe("runningNativeDemoUrl", () => {
  it("builds the URL from the website port when the state has no URL", () => {
    const dir = createTempDir();
    writeRunState(dir, process.pid, { port: 3007 });
    expect(runningNativeDemoUrl(dir)).toBe("http://localhost:3007");
  });

  it("is null when the live run has no website", () => {
    const dir = createTempDir();
    writeRunState(dir, process.pid, undefined);
    expect(runningNativeDemoUrl(dir)).toBeNull();
  });
});

describe("startNativeDemo", () => {
  it("fails with the spawn error when flisk up cannot start, and settles only once", async () => {
    const logPath = join(createTempDir(), "demo.log");
    const spawnFn = (() =>
      fakeChild((child) => {
        child.emit("error", new Error("spawn EACCES"));
        child.emit("error", new Error("second error"));
      })) as unknown as typeof spawn;
    const outcome = await startNativeDemo("/bin/flisk.js", "/demo", logPath, {
      spawnFn,
      pollMs: 5,
    });
    expect(outcome).toMatchObject({ ok: false, error: "spawn EACCES" });
  });
});

describe("runNativeDemo", () => {
  it("opens the demo that is already running instead of starting another", async () => {
    const dir = createTempDir();
    writeRunState(dir, process.pid, { url: "http://localhost:3009" });
    const code = await runNativeDemo({
      destination: dir,
      binPath: "/bin/flisk.js",
      reason: "--no-docker was passed",
      version: "1.2.3",
    });
    expect(code).toBe(0);
    expect(openUrl).toHaveBeenCalledWith("http://localhost:3009");
    expect(logs.join("\n")).toContain("The demo is already running: http://localhost:3009");
    expect(spawn).not.toHaveBeenCalled();
    expect(createDemoStage).not.toHaveBeenCalled();
  });

  it("refuses a folder with someone else's files", async () => {
    const dir = createTempDir();
    writeFileSync(join(dir, "notes.txt"), "mine");
    const open = vi.fn(async () => true);
    const code = await runNativeDemo({
      destination: dir,
      binPath: "/bin/flisk.js",
      reason: "Docker is not running",
      version: "1.2.3",
      open,
    });
    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("already exists and is not a Flisk demo folder");
    expect(logs.join("\n")).toContain("--project <dir>");
    expect(open).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("fails the write phase when no port is free", async () => {
    vi.mocked(isPortListening).mockResolvedValue(true);
    const dir = join(createTempDir(), "demo");
    const code = await runNativeDemo({
      destination: dir,
      binPath: "/bin/flisk.js",
      reason: "Docker is not running",
      version: "1.2.3",
      open: vi.fn(async () => true),
    });
    expect(code).toBe(1);
    expect(stage.fail).toHaveBeenCalledWith(
      expect.stringContaining("No free port between 4000 and 4099"),
      expect.stringContaining("Free a port"),
    );
    expect(stage.stop).toHaveBeenCalled();
    expect(existsSync(dir)).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("fails the start phase with the log path when flisk up exits early", async () => {
    vi.mocked(spawn).mockImplementation((() =>
      fakeChild((child) => child.emit("exit", 2))) as never);
    const dir = join(createTempDir(), "demo");
    const open = vi.fn(async () => true);
    const code = await runNativeDemo({
      destination: dir,
      binPath: "/bin/flisk.js",
      reason: "Docker is not running",
      version: "1.2.3",
      open,
    });
    expect(code).toBe(1);
    expect(stage.fail).toHaveBeenCalledWith(
      "flisk up stopped before the demo was ready (code 2)",
      `Run \`flisk up\` in ${dir} to see what they printed.`,
      logPathOf(dir),
    );
    expect(stage.finish).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    // The app was written before the start failed, so `flisk up` in the folder can show what went wrong.
    expect(existsSync(join(dir, "api", "service.json"))).toBe(true);
  });

  it("writes the app, starts flisk up, opens the website and prints both URLs", async () => {
    const dir = join(createTempDir(), "demo");
    vi.mocked(spawn).mockImplementation((() =>
      fakeChild(() =>
        writeFileSync(
          logPathOf(dir),
          '{"schemaVersion":1,"data":{"ok":true,"runtime":"native"}}\n',
        ),
      )) as never);
    const open = vi.fn(async () => true);
    const code = await runNativeDemo({
      destination: dir,
      binPath: "/bin/flisk.js",
      reason: "--no-docker was passed",
      version: "1.2.3",
      open,
    });
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain(
      "Running the small demo as local processes (--no-docker was passed)",
    );

    const [command, args, options] = vi.mocked(spawn).mock.calls[0] ?? [];
    expect(command).toBe(process.execPath);
    expect(args).toEqual(["/bin/flisk.js", "up", "--json"]);
    expect(options).toMatchObject({ cwd: dir, detached: true });

    const web = JSON.parse(readFileSync(join(dir, "web", "service.json"), "utf-8"));
    expect(web).toMatchObject({ port: 3000, env: { API_URL: "http://localhost:4000" } });

    expect(open).toHaveBeenCalledWith("http://localhost:3000");
    expect(stage.update).toHaveBeenCalledWith({ servicesReady: 2 });
    const phases = vi
      .mocked(stage.update)
      .mock.calls.map(([patch]) => (patch as { phases?: { id: string; status: string }[] }).phases)
      .filter(Boolean)
      .at(-1);
    expect(phases?.map((phase) => [phase.id, phase.status])).toEqual([
      ["write", "done"],
      ["start", "done"],
    ]);
    expect(stage.finish).toHaveBeenCalledWith({
      urls: ["http://localhost:3000", "http://localhost:4000/api/menu"],
      summary: "2 app services · local processes · no Docker",
      hint: `Stop it with \`flisk down\` in ${dir}.`,
      version: "1.2.3",
    });
    expect(stage.fail).not.toHaveBeenCalled();
    expect(stage.stop).toHaveBeenCalled();
  });
});
