// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeContainerTools } from "../../test-support/fake-container-tools.js";
import { createTempDir } from "../../test-support/temp-project.js";

const dirs = vi.hoisted(() => ({ home: "", cwd: "" }));
const stackMocks = vi.hoisted(() => ({
  runStackQuiet: vi.fn(),
  stopDemoStack: vi.fn(),
  stageUpdates: [] as Array<{
    phases?: Array<{ id: string; status: string; elapsedMs?: number }>;
  }>,
}));

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

// This suite exercises the Docker demo. Decide the path here instead of probing the host, so it runs the same on a
// developer's Windows machine (where the shell stubs below cannot execute) and on the hosted macOS runner.
vi.mock("../../utils/native-demo.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/native-demo.js")>()),
  nativeDemoReason: vi.fn(async () => null),
}));

vi.mock("../../utils/native-windows.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/native-windows.js")>()),
  nativeWindowsStackRefusal: vi.fn(() => null),
}));

// The test subject is where the demo lands on disk, so every step that needs
// Docker, the network or a browser reports success without doing anything.

vi.mock("../open.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../open.js")>()),
  listFrontendTargets: vi.fn(async () => []),
  pickReadyFrontend: vi.fn(async () => undefined),
  findReadyFrontend: vi.fn(async () => undefined),
  openFirstFrontend: vi.fn(async () => null),
}));

vi.mock("../../utils/url-actions.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/url-actions.js")>()),
  openUrl: vi.fn(async () => true),
}));

vi.mock("../../utils/one-command.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/one-command.js")>()),
  initializeProject: vi.fn(async () => ({ ok: true, output: "" })),
  installServiceDependencies: vi.fn(async () => []),
  runStackQuiet: stackMocks.runStackQuiet,
}));

vi.mock("../../utils/demo-reset.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/demo-reset.js")>();
  stackMocks.stopDemoStack.mockImplementation(actual.stopDemoStack);
  return { ...actual, stopDemoStack: stackMocks.stopDemoStack };
});

vi.mock("../../utils/demo-stage.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/demo-stage.js")>();
  return {
    ...actual,
    createDemoStage: (...args: Parameters<typeof actual.createDemoStage>) => {
      const stage = actual.createDemoStage(...args);
      return {
        ...stage,
        update: (patch: { phases?: Array<{ id: string; status: string; elapsedMs?: number }> }) => {
          stackMocks.stageUpdates.push(patch);
          stage.update(patch as never);
        },
      };
    },
  };
});

vi.mock("../../utils/demo-networks.js", () => ({
  ensureNetworkCapacity: vi.fn(async () => ({ ok: true, removed: [] })),
}));

vi.mock("../../utils/stack-progress.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/stack-progress.js")>()),
  // One `(Tiltfile)` build with Tilt's own timestamps: a clean start, not a reload (#4128).
  readStackProgress: vi.fn(async () => ({
    tiltfileLoad: { builds: 1, firstElapsedMs: 61_000 },
    ready: 0,
    building: 0,
    pending: 0,
    failed: 0,
    total: 9,
    working: [],
    broken: [],
  })),
}));

vi.mock("../../utils/tilt-port-owner.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/tilt-port-owner.js")>()),
  classifyTiltPorts: vi.fn(async () => ({ running: [] })),
}));

// Replace only the clone: it creates a fake project instead of touching the network.
vi.mock("../project.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../project.js")>()),
  cloneProjectTemplate: vi.fn(async (_template: string, target: string) => {
    const destination = isAbsolute(target) ? target : resolve(dirs.cwd, target);
    mkdirSync(join(destination, ".flisk"), { recursive: true });
    writeFileSync(join(destination, ".flisk", "project.json"), "{}\n");
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
  process.argv = [originalArgv[0], "/fake/bin/flisk.js", ...args];

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
  let restoreTools = () => {};

  beforeEach(() => {
    // The demo runs the machine checks before it starts the stack; stub docker and tilt so they pass without them installed (#2898).
    restoreTools = installFakeContainerTools();
    dirs.home = createTempDir("flisk-home-");
    dirs.cwd = createTempDir("flisk-cwd-");
    demoDir = join(dirs.home, ".flisk", "flisk-demo");

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new ExitSignal(code);
    }) as never);
    stackMocks.stageUpdates.length = 0;
    stackMocks.stopDemoStack.mockClear();
    stackMocks.stopDemoStack.mockImplementation(async () => true);
    stackMocks.runStackQuiet.mockResolvedValue({
      ok: true,
      raw: "",
      data: { tiltUrl: "http://localhost:10350" },
    });
  });

  afterEach(() => {
    restoreTools();
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it("creates ~/.flisk/flisk-demo on the first run", async () => {
    expect(existsSync(demoDir)).toBe(false);

    expect(await runDemoCli("demo")).toBe(0);

    expect(existsSync(join(demoDir, ".flisk", "project.json"))).toBe(true);
  });

  it("removes the previous directory and creates a fresh one on the second run", async () => {
    expect(await runDemoCli("demo")).toBe(0);

    const marker = join(demoDir, "stale-marker.txt");
    writeFileSync(marker, "left over from the first run");

    expect(await runDemoCli("demo")).toBe(0);

    expect(existsSync(marker)).toBe(false);
    expect(existsSync(join(demoDir, ".flisk", "project.json"))).toBe(true);
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
      // A successful demo now writes its log (including the Tiltfile evaluation count) under ~/.flisk, but the
      // project itself must still be in the current working directory.
      expect(existsSync(join(dirs.home, ".flisk", "flisk-demo"))).toBe(false);
    },
  );

  it.each(["swarm", "tool-loop"])(
    "--template=%s lands in a folder named after the starter",
    async (template) => {
      expect(await runDemoCli(`--template=${template}`)).toBe(0);

      expect(readdirSync(dirs.cwd)).toEqual([template]);
      expect(existsSync(join(dirs.cwd, template, ".flisk", "project.json"))).toBe(true);
    },
  );

  it("--project still wins for a generated starter", async () => {
    expect(await runDemoCli("--template=swarm", "--project=my-swarm")).toBe(0);

    expect(readdirSync(dirs.cwd)).toEqual(["my-swarm"]);
    expect(existsSync(join(dirs.cwd, "my-swarm", ".flisk", "project.json"))).toBe(true);
  });

  it("uses the first failed machine check and writes the stack output to a log", async () => {
    const raw = [
      "PASS Docker is running",
      "  FAIL Docker Compose is not available",
      "  FAIL Tilt is not installed",
    ].join("\n");
    stackMocks.runStackQuiet.mockResolvedValue({
      ok: false,
      raw,
      error: "The stack stopped before it was ready.",
    });

    expect(await runDemoCli("demo")).toBe(1);

    const output = vi
      .mocked(process.stderr.write)
      .mock.calls.map(([chunk]) => String(chunk))
      .join("");
    expect(output).toContain("Docker Compose is not available");
    expect(output).not.toContain("Tilt is not installed");

    const logDir = join(dirs.home, ".flisk", "logs");
    const [logName] = readdirSync(logDir);
    expect(logName).toBeDefined();
    expect(readFileSync(join(logDir, logName as string), "utf8")).toContain(
      `--- stack ---\n${raw}`,
    );
  });

  it.each([
    {
      description: "all machine checks pass",
      raw: "PASS Docker is running\nPASS Tilt is installed",
      error: "The stack stopped before it was ready.",
    },
    {
      description: "stack output is missing",
      raw: undefined,
      error: "Unable to start the stack",
    },
  ])("falls back to the stack error when $description", async ({ raw, error }) => {
    stackMocks.runStackQuiet.mockResolvedValue({ ok: false, raw, error });

    expect(await runDemoCli("demo")).toBe(1);

    const output = vi
      .mocked(process.stderr.write)
      .mock.calls.map(([chunk]) => String(chunk))
      .join("");
    expect(output).toContain(error);
  });

  it("answers --help before it touches a stopped demo checkout", async () => {
    expect(await runDemoCli("demo")).toBe(0);
    const marker = join(demoDir, "keep-me.txt");
    writeFileSync(marker, "mine");
    stackMocks.stopDemoStack.mockClear();

    expect(await runDemoCli("--template=demo", "--help")).toBe(0);

    expect(existsSync(marker)).toBe(true);
    expect(stackMocks.stopDemoStack).not.toHaveBeenCalled();
  });

  it("refuses a malformed --project before any setup", async () => {
    expect(await runDemoCli("restaurant", "--project", "--keep")).toBe(1);
    expect(await runDemoCli("restaurant", "--project=")).toBe(1);
    expect(readdirSync(dirs.cwd)).toEqual([]);
  });

  it("refuses --dry-run as an unknown option and starts nothing (#4487)", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    stackMocks.runStackQuiet.mockClear();

    expect(await runDemoCli("demo", "--dry-run")).toBe(1);

    expect(errors).toHaveBeenCalledWith(expect.stringContaining("unknown option '--dry-run'"));
    expect(existsSync(demoDir)).toBe(false);
    expect(stackMocks.runStackQuiet).not.toHaveBeenCalled();
    expect(stackMocks.stopDemoStack).not.toHaveBeenCalled();
    expect(readdirSync(dirs.cwd)).toEqual([]);
  });

  it("keeps the checkout and exits when the previous stack cannot be stopped", async () => {
    expect(await runDemoCli("demo")).toBe(0);
    const marker = join(demoDir, "stale-marker.txt");
    writeFileSync(marker, "left over");
    stackMocks.stopDemoStack.mockRejectedValue(new Error("docker compose down failed"));

    expect(await runDemoCli("demo")).toBe(1);

    expect(existsSync(marker)).toBe(true);
  });

  it("marks setup phases active before they run", async () => {
    expect(await runDemoCli("demo")).toBe(0);

    const seen = (id: string, status: string) =>
      stackMocks.stageUpdates.findIndex((patch) =>
        patch.phases?.some((phase) => phase.id === id && phase.status === status),
      );
    for (const id of ["fetch", "config", "deps", "reading", "start"]) {
      expect(seen(id, "active")).toBeGreaterThanOrEqual(0);
      expect(seen(id, "active")).toBeLessThan(seen(id, "done"));
    }
  });

  it("shows the previous stack's reset as a timed phase on a second run (#4128)", async () => {
    expect(await runDemoCli("demo")).toBe(0);
    const marker = join(demoDir, "stale-marker.txt");
    writeFileSync(marker, "left over");

    expect(await runDemoCli("demo")).toBe(0);

    const reset = stackMocks.stageUpdates
      .flatMap((patch) => patch.phases ?? [])
      .filter((phase) => phase.id === "reset" && phase.status === "done")
      .at(-1);
    expect(reset?.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(reset?.elapsedMs).toBeLessThan(10_000);
    const output = vi
      .mocked(process.stderr.write)
      .mock.calls.map(([chunk]) => String(chunk))
      .join("");
    expect(output).toContain("Resetting the previous demo");
  });

  it("reports the first Tiltfile load as its own phase with Tilt's timing (#4128)", async () => {
    const { classifyTiltPorts } = await import("../../utils/tilt-port-owner.js");
    const { readStackProgress } = await import("../../utils/stack-progress.js");
    vi.mocked(classifyTiltPorts).mockResolvedValue({ running: [10350] } as never);

    let progressSeen: () => void = () => {};
    const seen = new Promise<void>((resolve) => {
      progressSeen = resolve;
    });
    vi.mocked(readStackProgress).mockImplementation(async () => {
      // Let the watcher consume this frame before `flisk up` finishes, so the phase is set from Tilt's
      // timestamps rather than from the fallback wall clock.
      setTimeout(progressSeen, 0);
      return {
        tiltfileLoad: { builds: 1, firstElapsedMs: 61_000 },
        ready: 0,
        building: 0,
        pending: 0,
        failed: 0,
        total: 9,
        working: [],
        broken: [],
      } as never;
    });
    stackMocks.runStackQuiet.mockImplementation(async () => {
      await seen;
      return { ok: true, raw: "", data: { tiltUrl: "http://localhost:10350" } };
    });

    expect(await runDemoCli("demo")).toBe(0);

    const reading = stackMocks.stageUpdates
      .flatMap((patch) => patch.phases ?? [])
      .filter((phase) => phase.id === "reading" && phase.status === "done")
      .at(-1);
    expect(reading?.elapsedMs).toBe(61_000);
    const output = vi
      .mocked(process.stderr.write)
      .mock.calls.map(([chunk]) => String(chunk))
      .join("");
    expect(output).toContain("Reading the project");
    expect(output).toContain("1m 1s");

    const logDir = join(dirs.home, ".flisk", "logs");
    const [logName] = readdirSync(logDir);
    expect(logName).toBeDefined();
    expect(readFileSync(join(logDir, logName as string), "utf8")).toContain(
      "Tiltfile evaluations: 1",
    );
  });

  it("watches the Tilt port that TILT_PORT selected", async () => {
    const { classifyTiltPorts } = await import("../../utils/tilt-port-owner.js");
    process.env.TILT_PORT = "10377";
    try {
      expect(await runDemoCli("demo")).toBe(0);
    } finally {
      delete process.env.TILT_PORT;
    }
    const firstCall = vi.mocked(classifyTiltPorts).mock.calls[0];
    expect(firstCall?.[0][0]).toBe(10377);
  });

  it("does not take the already-running shortcut while a backend is not ready", async () => {
    expect(await runDemoCli("demo")).toBe(0);
    const { listFrontendTargets, pickReadyFrontend } = await import("../open.js");
    const { classifyTiltPorts } = await import("../../utils/tilt-port-owner.js");
    const { readStackProgress } = await import("../../utils/stack-progress.js");
    const target = { name: "web", url: "http://web.localhost" };
    vi.mocked(listFrontendTargets).mockResolvedValue([target]);
    vi.mocked(pickReadyFrontend).mockResolvedValue(target);
    vi.mocked(classifyTiltPorts).mockResolvedValue({ running: [10350] } as never);
    vi.mocked(readStackProgress).mockResolvedValue({ ready: 3, total: 6, building: 3 } as never);
    stackMocks.stopDemoStack.mockClear();

    await runDemoCli("demo");

    // The frontend answers, but 3 of 6 resources are ready: the old stack is stopped and replaced.
    expect(stackMocks.stopDemoStack).toHaveBeenCalled();
  });

  it("takes the shortcut when the frontend and every resource are ready", async () => {
    expect(await runDemoCli("demo")).toBe(0);
    const { listFrontendTargets, pickReadyFrontend } = await import("../open.js");
    const { classifyTiltPorts } = await import("../../utils/tilt-port-owner.js");
    const { readStackProgress } = await import("../../utils/stack-progress.js");
    const target = { name: "web", url: "http://web.localhost" };
    vi.mocked(listFrontendTargets).mockResolvedValue([target]);
    vi.mocked(pickReadyFrontend).mockResolvedValue(target);
    vi.mocked(classifyTiltPorts).mockResolvedValue({ running: [10350] } as never);
    vi.mocked(readStackProgress).mockResolvedValue({ ready: 6, total: 6, building: 0 } as never);
    stackMocks.stopDemoStack.mockClear();

    expect(await runDemoCli("demo")).toBe(0);

    expect(stackMocks.stopDemoStack).not.toHaveBeenCalled();
  });
});
