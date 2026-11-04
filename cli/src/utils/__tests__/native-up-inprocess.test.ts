// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempDir, makeResource } from "../../test-support/index.js";

const runtime = vi.hoisted(() => ({
  findMissingPrograms: vi.fn(),
  isPortListening: vi.fn(),
  isProcessAlive: vi.fn(),
  readNativeRunState: vi.fn(),
  stopNativeRun: vi.fn(),
  nativeRunStatePath: vi.fn(),
  supervisorStart: vi.fn(),
  supervisorStop: vi.fn(),
  supervisorArgs: [] as unknown[][],
}));
const toolchain = vi.hoisted(() => ({ findToolchainMismatches: vi.fn() }));
const occupant = vi.hoisted(() => ({ findPortOccupant: vi.fn() }));
const errors = vi.hoisted(() => ({ showError: vi.fn() }));

vi.mock("../native-runtime.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../native-runtime.js")>();
  class FakeSupervisor {
    constructor(...args: unknown[]) {
      runtime.supervisorArgs.push(args);
    }
    start() {
      return runtime.supervisorStart();
    }
    stop() {
      return runtime.supervisorStop();
    }
  }
  return {
    ...actual,
    findMissingPrograms: runtime.findMissingPrograms,
    isPortListening: runtime.isPortListening,
    isProcessAlive: runtime.isProcessAlive,
    readNativeRunState: runtime.readNativeRunState,
    stopNativeRun: runtime.stopNativeRun,
    nativeRunStatePath: runtime.nativeRunStatePath,
    NativeSupervisor: FakeSupervisor,
  };
});
vi.mock("../toolchain.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../toolchain.js")>()),
  findToolchainMismatches: toolchain.findToolchainMismatches,
}));
vi.mock("../port-occupant.js", () => ({ findPortOccupant: occupant.findPortOccupant }));
vi.mock("../errors.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../errors.js")>()),
  showError: errors.showError,
}));

const { runNativeUp, runVariables } = await import("../native-up.js");

class ExitCalled extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}
const throwingExit = (code: number): never => {
  throw new ExitCalled(code);
};

const api = makeResource("api", "backend", { command: "node server.js", port: 4100 });
const web = makeResource("web", "frontend", {
  command: "node web.js",
  port: 4200,
  dependsOn: ["api"],
});

type Handler = (...args: unknown[]) => void;
let handlers: Map<string, Handler>;
let logs: string[];
let warnings: string[];

beforeEach(() => {
  for (const mock of [
    ...Object.values(runtime).filter((value) => typeof value === "function"),
    toolchain.findToolchainMismatches,
    occupant.findPortOccupant,
    errors.showError,
  ]) {
    (mock as ReturnType<typeof vi.fn>).mockReset();
  }
  runtime.supervisorArgs.length = 0;
  runtime.findMissingPrograms.mockReturnValue([]);
  runtime.isPortListening.mockResolvedValue(false);
  runtime.isProcessAlive.mockReturnValue(false);
  runtime.readNativeRunState.mockReturnValue(null);
  runtime.stopNativeRun.mockResolvedValue(undefined);
  runtime.supervisorStart.mockResolvedValue([]);
  runtime.supervisorStop.mockResolvedValue(undefined);
  toolchain.findToolchainMismatches.mockReturnValue([]);
  occupant.findPortOccupant.mockReturnValue(null);
  handlers = new Map();
  const capture = ((event: string, handler: Handler) => {
    handlers.set(event, handler);
    return process;
  }) as unknown as typeof process.on;
  vi.spyOn(process, "on").mockImplementation(capture);
  vi.spyOn(process, "once").mockImplementation(capture as unknown as typeof process.once);
  logs = [];
  warnings = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warnings.push(args.join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe("runVariables", () => {
  it("reads the project .env and lets the shell override it", () => {
    const root = createTempDir();
    writeFileSync(join(root, ".env"), "FLISK_NU_FILE_ONLY=from-file\nHOME=from-file\n");
    const vars = runVariables(root);
    expect(vars.FLISK_NU_FILE_ONLY).toBe("from-file");
    expect(vars.HOME).toBe(process.env.HOME);
  });

  it("uses an explicit env file and tolerates a missing one", () => {
    const root = createTempDir();
    writeFileSync(join(root, "custom.env"), "FLISK_NU_CUSTOM=yes\n");
    expect(runVariables(root, join(root, "custom.env")).FLISK_NU_CUSTOM).toBe("yes");
    expect(runVariables(root, join(root, "absent.env")).FLISK_NU_CUSTOM).toBeUndefined();
  });
});

describe("runNativeUp failures before anything starts", () => {
  it("fails on an invalid plan with INVALID_SERVICE_CONFIG", async () => {
    const emit = vi.fn();
    const broken = makeResource("api", "backend", {
      command: "node server.js",
      dependsOn: ["postgres"],
    });
    await expect(
      runNativeUp({
        projectRoot: createTempDir(),
        selected: [broken],
        dependencies: [],
        emit,
        exit: throwingExit,
      }),
    ).rejects.toMatchObject({ code: 1 });
    const [, issues] = emit.mock.calls[0];
    expect(issues[0].code).toBe("INVALID_SERVICE_CONFIG");
    expect(issues[0].message).toContain('dependsOn "postgres"');
    expect(errors.showError).toHaveBeenCalledWith(expect.stringContaining("postgres"));
  });

  it("fails on a binding toolchain mismatch but ignores hints", async () => {
    toolchain.findToolchainMismatches.mockReturnValue([
      { tool: "node", version: "18", source: "service.json", isHint: false, service: "api" },
      { tool: "bun", version: "1", source: ".tool-versions", isHint: true, service: "api" },
    ]);
    const emit = vi.fn();
    await expect(
      runNativeUp({
        projectRoot: createTempDir(),
        selected: [api],
        dependencies: [],
        emit,
        exit: throwingExit,
      }),
    ).rejects.toBeInstanceOf(ExitCalled);
    const [data, issues] = emit.mock.calls[0];
    expect(data).toEqual({ ok: false, runtime: "native" });
    expect(issues[0].code).toBe("TOOLCHAIN_MISMATCH");
    expect(issues[0].message).toContain('change "toolchain" in the service.json');
  });

  it("fails when a command's program is not installed", async () => {
    runtime.findMissingPrograms.mockReturnValue([{ name: "api", program: "uv" }]);
    const emit = vi.fn();
    await expect(
      runNativeUp({
        projectRoot: createTempDir(),
        selected: [api],
        dependencies: [],
        emit,
        exit: throwingExit,
      }),
    ).rejects.toBeInstanceOf(ExitCalled);
    expect(emit.mock.calls[0][1][0]).toEqual({
      code: "NATIVE_COMMAND_NOT_FOUND",
      message:
        'service "api" runs uv, which is not installed (not found on PATH). Install it, or change "command" in its service.json.',
    });
  });

  it("fails when a service port is taken, naming the occupant", async () => {
    runtime.isPortListening.mockImplementation(async (port: number) => port === 4100);
    occupant.findPortOccupant.mockReturnValue({ command: "nginx", pid: 77 });
    const emit = vi.fn();
    await expect(
      runNativeUp({
        projectRoot: createTempDir(),
        selected: [api],
        dependencies: [],
        emit,
        quiet: true,
        exit: throwingExit,
      }),
    ).rejects.toBeInstanceOf(ExitCalled);
    expect(emit.mock.calls[0][1][0]).toEqual({
      code: "PORT_IN_USE",
      message:
        'Port 4100 for service "api" is already in use by nginx (pid 77). Stop it, or change "port" in the service.json.',
    });
    expect(runtime.supervisorArgs).toHaveLength(0);
  });

  it("reports a taken port without an occupant when none is found", async () => {
    runtime.isPortListening.mockResolvedValue(true);
    const emit = vi.fn();
    await expect(
      runNativeUp({
        projectRoot: createTempDir(),
        selected: [api],
        dependencies: [],
        emit,
        quiet: true,
        exit: throwingExit,
      }),
    ).rejects.toBeInstanceOf(ExitCalled);
    expect(emit.mock.calls[0][1][0].message).toBe(
      'Port 4100 for service "api" is already in use. Stop it, or change "port" in the service.json.',
    );
  });
});

describe("runNativeUp dry run", () => {
  it("prints the plan, warns about unset variables and emits the start order", async () => {
    const withVar = makeResource("api", "backend", {
      command: "node server.js",
      port: 4100,
      env: { TOKEN: ["$", "{", "FLISK_NU_SURELY_UNSET", "}"].join("") },
    });
    const emit = vi.fn();
    await runNativeUp({
      projectRoot: createTempDir(),
      selected: [withVar, web],
      dependencies: [],
      stackName: "core",
      dryRun: true,
      emit,
      exit: throwingExit,
    });
    expect(warnings.join("\n")).toContain("api: FLISK_NU_SURELY_UNSET");
    expect(logs[0]).toContain('Would start stack "core" as local processes');
    expect(logs).toContainEqual(expect.stringContaining("web: node web.js (after api)"));
    expect(logs).toContainEqual(expect.stringContaining("Dry run: not starting services"));
    expect(emit).toHaveBeenCalledWith({
      ok: true,
      dryRun: true,
      runtime: "native",
      stack: "core",
      services: ["api", "web"],
      startOrder: [["api"], ["web"]],
    });
    expect(runtime.supervisorArgs).toHaveLength(0);
  });

  it("describes a --only selection with its dependencies", async () => {
    const emit = vi.fn();
    await runNativeUp({
      projectRoot: createTempDir(),
      selected: [api, web],
      dependencies: ["api"],
      only: ["web"],
      dryRun: true,
      emit,
      exit: throwingExit,
    });
    expect(logs[0]).toContain("1 requested service plus api");
    expect(emit.mock.calls[0][0]).toMatchObject({
      stack: null,
      requested: ["web"],
      declaredDependencies: ["api"],
    });
  });

  it("counts services and prints nothing when quiet", async () => {
    await runNativeUp({
      projectRoot: createTempDir(),
      selected: [api],
      dependencies: [],
      dryRun: true,
      exit: throwingExit,
    });
    expect(logs[0]).toContain("Would start 1 service as local processes");
    logs.length = 0;
    await runNativeUp({
      projectRoot: createTempDir(),
      selected: [api],
      dependencies: [],
      dryRun: true,
      quiet: true,
      exit: throwingExit,
    });
    expect(logs).toEqual([]);
  });
});

describe("runNativeUp with an existing run", () => {
  it("reports a live run and returns without starting a second one", async () => {
    runtime.readNativeRunState.mockReturnValue({ pid: 999_999 });
    runtime.isProcessAlive.mockReturnValue(true);
    const emit = vi.fn();
    await runNativeUp({
      projectRoot: createTempDir(),
      selected: [api],
      dependencies: [],
      emit,
      exit: throwingExit,
    });
    expect(emit).toHaveBeenCalledWith({
      ok: true,
      alreadyRunning: true,
      runtime: "native",
      pid: 999_999,
    });
    expect(logs).toContainEqual(expect.stringContaining("pid 999999"));
    expect(logs).toContainEqual(expect.stringContaining("pass --force to restart it"));
    expect(runtime.stopNativeRun).not.toHaveBeenCalled();
    expect(runtime.supervisorArgs).toHaveLength(0);
  });

  it("stops the previous run under --force before starting", async () => {
    runtime.readNativeRunState.mockReturnValue({ pid: 999_999 });
    runtime.isProcessAlive.mockReturnValue(true);
    runtime.supervisorStart.mockResolvedValue([{ name: "api", reason: "exited with code 1" }]);
    const root = createTempDir();
    const exit = vi.fn();
    await runNativeUp({
      projectRoot: root,
      selected: [api],
      dependencies: [],
      force: true,
      quiet: true,
      exit: exit as unknown as (code: number) => never,
    });
    expect(runtime.stopNativeRun).toHaveBeenCalledWith(root);
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("runNativeUp start", () => {
  it("reports services that did not start, stops the rest and exits 1", async () => {
    runtime.supervisorStart.mockResolvedValue([{ name: "api", reason: "health check timed out" }]);
    const emit = vi.fn();
    const exit = vi.fn();
    await runNativeUp({
      projectRoot: createTempDir(),
      selected: [api],
      dependencies: [],
      emit,
      quiet: true,
      exit: exit as unknown as (code: number) => never,
    });
    const [data, issues] = emit.mock.calls[0];
    expect(data).toEqual({
      ok: false,
      runtime: "native",
      failures: [{ name: "api", reason: "health check timed out" }],
    });
    expect(issues[0].code).toBe("UP_RESOURCE_FAILED");
    expect(issues[0].message).toContain("✗ api: health check timed out");
    expect(issues[0].message).toContain(join(".flisk", "native", "logs"));
    expect(runtime.supervisorStop).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("prints the URLs once every service is up, then stays running", async () => {
    const root = createTempDir();
    const healthy = makeResource("api", "backend", {
      command: "node server.js",
      port: 4100,
      healthCheck: { path: "/health" },
    });
    const emit = vi.fn();
    const exit = vi.fn();
    let settled = false;
    void runNativeUp({
      projectRoot: root,
      selected: [healthy, web],
      dependencies: ["api"],
      only: ["web"],
      emit,
      readyTimeoutMs: 1234,
      exit: exit as unknown as (code: number) => never,
    }).then(() => {
      settled = true;
    });
    await flush();
    expect(emit).toHaveBeenCalledWith({
      ok: true,
      runtime: "native",
      stack: null,
      services: ["api", "web"],
      requested: ["web"],
      dependencies: ["api"],
      urls: { api: "http://localhost:4100", web: "http://localhost:4200" },
    });
    const output = logs.join("\n");
    expect(output).toContain("Flisk is up (local processes, no Docker).");
    expect(output).toContain(
      "✓ api → http://localhost:4100 (health: http://localhost:4100/health)",
    );
    expect(output).toContain("Stop: Ctrl+C here, or flisk down from another terminal");
    expect(settled).toBe(false);

    // The supervisor gets the run variables and the ready timeout, and prefixes service output.
    const [projectRoot, plans, events, options] = runtime.supervisorArgs[0] as [
      string,
      Array<{ name: string }>,
      {
        onLine?: (name: string, line: string) => void;
        onNote?: (name: string, msg: string) => void;
      },
      { readyTimeoutMs?: number; baseEnv?: Record<string, string> },
    ];
    expect(projectRoot).toBe(root);
    expect(plans.map((plan) => plan.name)).toEqual(["api", "web"]);
    expect(options.readyTimeoutMs).toBe(1234);
    expect(options.baseEnv?.HOME).toBe(process.env.HOME);
    logs.length = 0;
    events.onLine?.("web", "listening");
    events.onNote?.("api", "ready");
    expect(logs[0]).toContain("web");
    expect(logs[0]).toContain("listening");
    expect(logs[1]).toContain("[flisk] ready");

    // Ctrl+C stops the supervisor once and exits 0, however many signals arrive.
    expect([...handlers.keys()]).toEqual(
      expect.arrayContaining(["SIGINT", "SIGTERM", "SIGHUP", "exit"]),
    );
    handlers.get("SIGINT")?.();
    handlers.get("SIGTERM")?.();
    await flush();
    expect(runtime.supervisorStop).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(logs).toContainEqual(expect.stringContaining("Stopping local processes..."));
  });

  it("passes no output callbacks when quiet and removes its own run.json on exit", async () => {
    const root = createTempDir();
    const statePath = join(root, "run.json");
    writeFileSync(statePath, "{}");
    runtime.nativeRunStatePath.mockReturnValue(statePath);
    const emit = vi.fn();
    void runNativeUp({
      projectRoot: root,
      selected: [api],
      dependencies: [],
      stackName: "core",
      emit,
      quiet: true,
      exit: vi.fn() as unknown as (code: number) => never,
    });
    await flush();
    expect(emit.mock.calls[0][0]).toMatchObject({ ok: true, stack: "core", services: ["api"] });
    expect(logs).toEqual([]);
    const events = runtime.supervisorArgs[0][2] as Record<string, unknown>;
    expect(events.onLine).toBeUndefined();
    expect(events.onNote).toBeUndefined();

    // Another process's run.json is left alone.
    runtime.readNativeRunState.mockReturnValue({ pid: process.pid + 1 });
    handlers.get("exit")?.();
    expect(existsSync(statePath)).toBe(true);
    runtime.readNativeRunState.mockReturnValue({ pid: process.pid });
    handlers.get("exit")?.();
    expect(existsSync(statePath)).toBe(false);
  });

  it("does not report failures when it is stopped while starting", async () => {
    let finishStart: (failures: unknown[]) => void = () => {};
    runtime.supervisorStart.mockReturnValue(
      new Promise((resolve) => {
        finishStart = resolve;
      }),
    );
    const emit = vi.fn();
    const exit = vi.fn();
    const run = runNativeUp({
      projectRoot: createTempDir(),
      selected: [api],
      dependencies: [],
      emit,
      quiet: true,
      exit: exit as unknown as (code: number) => never,
    });
    await flush();
    handlers.get("SIGTERM")?.();
    finishStart([{ name: "api", reason: "killed" }]);
    await run;
    expect(emit).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });
});
