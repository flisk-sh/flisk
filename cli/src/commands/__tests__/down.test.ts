// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  runTiltMock,
  buildTiltDownArgsMock,
  getContainerRuntimeStatusMock,
  isTiltAvailableMock,
  pruneProjectNetworksMock,
  stopProjectTiltUpMock,
  waitForTiltUpExitMock,
  createJsonEmitterMock,
  findRunningFliskProjectsMock,
  pruneDockerBuildCacheMock,
  stopProjectComposeProjectsMock,
} = vi.hoisted(() => ({
  runTiltMock: vi.fn(),
  buildTiltDownArgsMock: vi.fn(),
  getContainerRuntimeStatusMock: vi.fn(() => "missing" as "running" | "unresponsive" | "missing"),
  isTiltAvailableMock: vi.fn(async () => false),
  pruneProjectNetworksMock: vi.fn(),
  stopProjectTiltUpMock: vi.fn(() => [] as number[]),
  waitForTiltUpExitMock: vi.fn(async () => true),
  createJsonEmitterMock: vi.fn(),
  findRunningFliskProjectsMock: vi.fn((): string[] => []),
  pruneDockerBuildCacheMock: vi.fn(),
  stopProjectComposeProjectsMock: vi.fn(),
}));
const originalCwd = process.cwd();

vi.mock("../../utils/docker.js", () => ({
  getContainerRuntimeStatus: getContainerRuntimeStatusMock,
}));

vi.mock("../../utils/docker-build-cache.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/docker-build-cache.js")>()),
  pruneDockerBuildCache: pruneDockerBuildCacheMock,
}));

// The real lookup reads `ps`, and a stack running on the test machine must never be picked (or stopped) by a test.
vi.mock("../../utils/down-cleanup.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/down-cleanup.js")>()),
  findRunningFliskProjects: findRunningFliskProjectsMock,
  pruneProjectNetworks: pruneProjectNetworksMock,
  stopProjectComposeProjects: stopProjectComposeProjectsMock,
  stopProjectTiltUp: stopProjectTiltUpMock,
  waitForTiltUpExit: waitForTiltUpExitMock,
}));

vi.mock("../../utils/tilt.js", () => ({
  buildTiltDownArgs: buildTiltDownArgsMock,
  getTiltfilePath: vi.fn(),
  isTiltAvailable: isTiltAvailableMock,
  runTilt: runTiltMock,
}));

vi.mock("../../utils/json-output.js", () => ({
  createJsonEmitter: createJsonEmitterMock,
}));

import { buildTiltDownArgs } from "../../utils/tilt.js";
import { downCommand } from "../down.js";

const VALID_PROJECT_CONFIG = {
  version: "1.0.0",
  project: { name: "test-project", version: "1.0.0" },
  phases: Object.fromEntries(
    ["pre_alpha", "alpha", "beta", "out_of_scope"].map((name) => [
      name,
      { name, description: "", enabledStacks: [] },
    ]),
  ),
  optional_infra: {
    monitoring: false,
    elk: false,
    debezium: false,
    golden_image: false,
    verdaccio: false,
  },
  discovery: { paths: ["services/**"] },
};

function setupTestProject(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "flisk-down-prune-test-"));
  mkdirSync(join(tempDir, ".flisk"), { recursive: true });
  writeFileSync(join(tempDir, ".flisk", "project.json"), JSON.stringify(VALID_PROJECT_CONFIG));
  process.chdir(tempDir);
  getContainerRuntimeStatusMock.mockReturnValue("running");
  isTiltAvailableMock.mockResolvedValue(true);
  buildTiltDownArgsMock.mockReturnValue(["-f", "/fake/Tiltfile"]);
  runTiltMock.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
  return tempDir;
}

describe("flisk down", () => {
  beforeEach(() => {
    getContainerRuntimeStatusMock.mockReset().mockReturnValue("missing");
    isTiltAvailableMock.mockReset().mockResolvedValue(false);
    pruneProjectNetworksMock.mockReset();
    stopProjectTiltUpMock.mockReset().mockReturnValue([]);
    waitForTiltUpExitMock.mockReset().mockResolvedValue(true);
    createJsonEmitterMock.mockReset();
    findRunningFliskProjectsMock.mockReset().mockReturnValue([]);
    pruneDockerBuildCacheMock.mockReset();
    stopProjectComposeProjectsMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    runTiltMock.mockReset();
    for (const option of [
      "dryRun",
      "json",
      "verbose",
      "force",
      "yes",
      "pruneNetworks",
      "pruneCache",
      "cacheUntil",
    ]) {
      downCommand.setOptionValue(option, false);
    }
    downCommand.setOptionValue("project", undefined);
    downCommand.setOptionValue("cacheUntil", undefined);
    // createProgram() makes the shared downCommand a child of a root program that keeps its own --project value.
    downCommand.parent?.setOptionValue("project", undefined);
  });

  /** A scratch Flisk project folder (realpath, as process.cwd() reports it on macOS). */
  function scratchProject(name: string): string {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), `flisk-down-${name}-`)));
    mkdirSync(join(dir, ".flisk"), { recursive: true });
    writeFileSync(join(dir, ".flisk", "project.json"), "{}");
    return dir;
  }

  /** Runs `flisk down` (with Docker and Tilt available) and returns the folder it ran `tilt down` from. */
  async function downFrom(
    cwd: string,
    args: string[],
  ): Promise<{ tiltCwd?: string; output: string }> {
    getContainerRuntimeStatusMock.mockReturnValue("running");
    isTiltAvailableMock.mockResolvedValue(true);
    buildTiltDownArgsMock.mockReturnValue(["-f", "/fake/Tiltfile"]);
    let tiltCwd: string | undefined;
    runTiltMock.mockImplementation(async () => {
      tiltCwd = process.cwd();
      return { exitCode: 0, stdout: "", stderr: "" };
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    process.chdir(cwd);
    try {
      await downCommand.parseAsync(["node", "flisk", ...args], { from: "node" });
      return { tiltCwd, output: log.mock.calls.map((call) => call.join(" ")).join("\n") };
    } finally {
      process.chdir(originalCwd);
      log.mockRestore();
    }
  }

  /** Runs `flisk down` expecting it to exit with an error, and returns what it printed to stderr. */
  async function downFails(cwd: string, args: string[]): Promise<string> {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit:1");
    }) as never);
    process.chdir(cwd);
    try {
      await expect(
        downCommand.parseAsync(["node", "flisk", ...args], { from: "node" }),
      ).rejects.toThrow("exit:1");
      return error.mock.calls.flat().join("\n");
    } finally {
      process.chdir(originalCwd);
      exit.mockRestore();
      error.mockRestore();
    }
  }

  it("outside a project stops the only Flisk project that is running, from its folder", async () => {
    const project = scratchProject("running");
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), "flisk-down-elsewhere-")));
    findRunningFliskProjectsMock.mockReturnValue([project]);
    try {
      const { tiltCwd, output } = await downFrom(elsewhere, ["--yes"]);
      expect(tiltCwd).toBe(project);
      expect(output).toContain(`stopping the one that is running: ${project}`);
    } finally {
      rmSync(project, { recursive: true, force: true });
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it("outside a project lists the running projects instead of guessing when several run", async () => {
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), "flisk-down-elsewhere-")));
    findRunningFliskProjectsMock.mockReturnValue(["/work/shop", "/work/blog"]);
    try {
      const output = await downFails(elsewhere, []);
      expect(output).toContain("Not in a Flisk project, and 2 Flisk projects are running");
      expect(output).toContain("flisk down --project /work/shop");
      expect(output).toContain("flisk down --project /work/blog");
      expect(runTiltMock).not.toHaveBeenCalled();
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it("--project stops that project from anywhere, and is preferred over a running one", async () => {
    const project = scratchProject("named");
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), "flisk-down-elsewhere-")));
    findRunningFliskProjectsMock.mockReturnValue(["/work/other"]);
    try {
      const { tiltCwd } = await downFrom(elsewhere, ["--yes", "--project", project]);
      expect(tiltCwd).toBe(project);
      expect(findRunningFliskProjectsMock).not.toHaveBeenCalled();
    } finally {
      rmSync(project, { recursive: true, force: true });
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it("--project reaches down through the root program, which has its own --project", async () => {
    const { createProgram } = await import("../../program.js");
    const project = scratchProject("via-root");
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), "flisk-down-elsewhere-")));
    findRunningFliskProjectsMock.mockReturnValue(["/work/other"]);
    getContainerRuntimeStatusMock.mockReturnValue("running");
    isTiltAvailableMock.mockResolvedValue(true);
    buildTiltDownArgsMock.mockReturnValue(["-f", "/fake/Tiltfile"]);
    let tiltCwd: string | undefined;
    runTiltMock.mockImplementation(async () => {
      tiltCwd = process.cwd();
      return { exitCode: 0, stdout: "", stderr: "" };
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    process.chdir(elsewhere);
    try {
      await createProgram().parseAsync(["node", "flisk", "down", "--yes", "--project", project]);
      expect(tiltCwd).toBe(project);
      expect(findRunningFliskProjectsMock).not.toHaveBeenCalled();
    } finally {
      process.chdir(originalCwd);
      log.mockRestore();
      rmSync(project, { recursive: true, force: true });
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it("--project on a folder that is not a Flisk project fails without running Tilt", async () => {
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), "flisk-down-elsewhere-")));
    try {
      const output = await downFails(elsewhere, ["--project", elsewhere]);
      expect(output).toContain(`No Flisk project at ${elsewhere}`);
      expect(runTiltMock).not.toHaveBeenCalled();
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it("inside a project stops that project even when another one is running", async () => {
    const project = scratchProject("here");
    findRunningFliskProjectsMock.mockReturnValue(["/work/other"]);
    try {
      const { tiltCwd } = await downFrom(project, ["--yes"]);
      expect(tiltCwd).toBe(project);
      expect(findRunningFliskProjectsMock).not.toHaveBeenCalled();
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it("prints the shared project-root error before checking prerequisites outside a project", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "flisk-down-test-"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit:1");
    }) as never);
    process.chdir(tempDir);

    try {
      await expect(downCommand.parseAsync(["node", "flisk"], { from: "node" })).rejects.toThrow(
        "exit:1",
      );

      const output = error.mock.calls.flat().join("\n");
      expect(output).toContain("Could not find project root (no .flisk/project.json found)");
      expect(output).toContain("Run this from within a Flisk project");
      expect(output).toContain("Run `flisk project --yes` to initialize a new project");
      expect(output).toContain("flisk down --project <path>");
      expect(runTiltMock).not.toHaveBeenCalled();
      expect(getContainerRuntimeStatusMock).not.toHaveBeenCalled();
      expect(isTiltAvailableMock).not.toHaveBeenCalled();
    } finally {
      process.chdir(originalCwd);
      rmSync(tempDir, { recursive: true, force: true });
      exit.mockRestore();
      error.mockRestore();
    }
  });

  it("emits one machine-readable project-root error before prerequisites in JSON mode", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "flisk-down-json-test-"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit:1");
    }) as never);
    process.chdir(tempDir);

    try {
      await expect(
        downCommand.parseAsync(["node", "flisk", "--json"], { from: "node" }),
      ).rejects.toThrow("exit:1");

      expect(log).toHaveBeenCalledTimes(1);
      const report = JSON.parse(String(log.mock.calls[0]?.[0]));
      expect(report).toMatchObject({
        schemaVersion: 1,
        data: null,
        errors: [
          {
            code: "COMMAND_FAILED",
            message: "Could not find project root (no .flisk/project.json found)",
            suggestions: [
              "Run this from within a Flisk project",
              "Run `flisk project --yes` to initialize a new project",
              "Or name the project to stop from anywhere: flisk down --project <path>",
            ],
          },
        ],
      });
      expect(error).toHaveBeenCalledWith(
        "Could not find project root (no .flisk/project.json found)",
      );
      expect(runTiltMock).not.toHaveBeenCalled();
      expect(getContainerRuntimeStatusMock).not.toHaveBeenCalled();
      expect(isTiltAvailableMock).not.toHaveBeenCalled();
    } finally {
      process.chdir(originalCwd);
      rmSync(tempDir, { recursive: true, force: true });
      exit.mockRestore();
      log.mockRestore();
      error.mockRestore();
    }
  });

  it("prints the dry-run plan without building arguments or invoking Tilt", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "flisk-down-dry-run-test-"));
    mkdirSync(join(tempDir, ".flisk"), { recursive: true });
    writeFileSync(join(tempDir, ".flisk", "project.json"), "{}");
    process.chdir(tempDir);
    getContainerRuntimeStatusMock.mockReturnValue("running");
    isTiltAvailableMock.mockResolvedValue(true);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await downCommand.parseAsync(["node", "flisk", "--dry-run"], { from: "node" });

      const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
      expect(output).toContain("Dry run - not stopping resources");
      expect(output).toContain("Would run: tilt down");
      expect(buildTiltDownArgs).not.toHaveBeenCalled();
      expect(runTiltMock).not.toHaveBeenCalled();
      expect(getContainerRuntimeStatusMock).toHaveBeenCalledTimes(1);
      expect(isTiltAvailableMock).toHaveBeenCalledTimes(1);
    } finally {
      process.chdir(originalCwd);
      rmSync(tempDir, { recursive: true, force: true });
      log.mockRestore();
    }
  });

  it("accepts --force as a deprecated alias for --yes without forwarding force to buildTiltDownArgs", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "flisk-down-force-test-"));
    mkdirSync(join(tempDir, ".flisk"), { recursive: true });
    writeFileSync(join(tempDir, ".flisk", "project.json"), "{}");
    process.chdir(tempDir);
    getContainerRuntimeStatusMock.mockReturnValue("running");
    isTiltAvailableMock.mockResolvedValue(true);
    buildTiltDownArgsMock.mockReturnValue(["-f", "/fake/Tiltfile"]);
    runTiltMock.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await downCommand.parseAsync(["node", "flisk", "--force"], { from: "node" });

      expect(downCommand.opts().yes).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "Note: --force (-f) on flisk down is deprecated; use --yes (-y) instead.",
        ),
      );
      expect(buildTiltDownArgsMock).toHaveBeenCalledWith(
        expect.not.objectContaining({ force: true }),
      );
      expect(runTiltMock).toHaveBeenCalledWith(
        "down",
        ["-f", "/fake/Tiltfile"],
        expect.any(Object),
      );
    } finally {
      process.chdir(originalCwd);
      rmSync(tempDir, { recursive: true, force: true });
      warn.mockRestore();
      log.mockRestore();
    }
  });

  it("accepts -f as a deprecated alias for -y/--yes with deprecation notice", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "flisk-down-force-short-test-"));
    mkdirSync(join(tempDir, ".flisk"), { recursive: true });
    writeFileSync(join(tempDir, ".flisk", "project.json"), "{}");
    process.chdir(tempDir);
    getContainerRuntimeStatusMock.mockReturnValue("running");
    isTiltAvailableMock.mockResolvedValue(true);
    buildTiltDownArgsMock.mockReturnValue(["-f", "/fake/Tiltfile"]);
    runTiltMock.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await downCommand.parseAsync(["node", "flisk", "-f"], { from: "node" });

      expect(downCommand.opts().yes).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "Note: --force (-f) on flisk down is deprecated; use --yes (-y) instead.",
        ),
      );
      expect(buildTiltDownArgsMock).toHaveBeenCalledWith(
        expect.not.objectContaining({ force: true }),
      );
      expect(runTiltMock).toHaveBeenCalledWith(
        "down",
        ["-f", "/fake/Tiltfile"],
        expect.any(Object),
      );
    } finally {
      process.chdir(originalCwd);
      rmSync(tempDir, { recursive: true, force: true });
      warn.mockRestore();
      log.mockRestore();
    }
  });

  it("accepts -y and --yes without printing the --force deprecation notice", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "flisk-down-yes-test-"));
    mkdirSync(join(tempDir, ".flisk"), { recursive: true });
    writeFileSync(join(tempDir, ".flisk", "project.json"), "{}");
    process.chdir(tempDir);
    getContainerRuntimeStatusMock.mockReturnValue("running");
    isTiltAvailableMock.mockResolvedValue(true);
    buildTiltDownArgsMock.mockReturnValue(["-f", "/fake/Tiltfile"]);
    runTiltMock.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await downCommand.parseAsync(["node", "flisk", "-y"], { from: "node" });

      expect(downCommand.opts().yes).toBe(true);
      expect(warn).not.toHaveBeenCalled();
      expect(runTiltMock).toHaveBeenCalledWith(
        "down",
        ["-f", "/fake/Tiltfile"],
        expect.any(Object),
      );

      downCommand.setOptionValue("yes", false);
      warn.mockClear();

      await downCommand.parseAsync(["node", "flisk", "--yes"], { from: "node" });

      expect(downCommand.opts().yes).toBe(true);
      expect(warn).not.toHaveBeenCalled();
      expect(runTiltMock).toHaveBeenCalledWith(
        "down",
        ["-f", "/fake/Tiltfile"],
        expect.any(Object),
      );
    } finally {
      process.chdir(originalCwd);
      rmSync(tempDir, { recursive: true, force: true });
      warn.mockRestore();
      log.mockRestore();
    }
  });

  describe("--prune-networks (pruneNetworksOrWarn)", () => {
    it("prunes project networks when the prune command succeeds", async () => {
      const tempDir = setupTestProject();
      pruneProjectNetworksMock.mockReturnValue({
        removed: ["test_project_backend", "test_project_database"],
        kept: [],
      });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        await downCommand.parseAsync(["node", "flisk", "--prune-networks"], { from: "node" });

        expect(pruneProjectNetworksMock).toHaveBeenCalledTimes(1);
        expect(pruneProjectNetworksMock).toHaveBeenCalledWith("test-project");

        const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
        expect(output).toContain("Removed networks: test_project_backend, test_project_database");
        expect(output).not.toContain("Could not remove networks");
      } finally {
        process.chdir(originalCwd);
        rmSync(tempDir, { recursive: true, force: true });
        log.mockRestore();
      }
    });

    it("logs kept networks when Docker keeps in-use networks during a successful prune", async () => {
      const tempDir = setupTestProject();
      pruneProjectNetworksMock.mockReturnValue({
        removed: [],
        kept: [{ name: "test_project_proxy", reason: "network has active endpoints" }],
      });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        await downCommand.parseAsync(["node", "flisk", "--prune-networks"], { from: "node" });

        expect(pruneProjectNetworksMock).toHaveBeenCalledTimes(1);
        expect(pruneProjectNetworksMock).toHaveBeenCalledWith("test-project");

        const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
        expect(output).not.toContain("Removed networks:");
        expect(output).toContain("Kept network test_project_proxy: network has active endpoints");
        expect(output).not.toContain("Could not remove networks");
      } finally {
        process.chdir(originalCwd);
        rmSync(tempDir, { recursive: true, force: true });
        log.mockRestore();
      }
    });

    it("logs a warning and does not throw when prune fails", async () => {
      const tempDir = setupTestProject();
      pruneProjectNetworksMock.mockImplementation(() => {
        throw new Error("docker daemon is unreachable");
      });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        await expect(
          downCommand.parseAsync(["node", "flisk", "--prune-networks"], { from: "node" }),
        ).resolves.not.toThrow();

        expect(pruneProjectNetworksMock).toHaveBeenCalledTimes(1);
        expect(pruneProjectNetworksMock).toHaveBeenCalledWith("test-project");

        const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
        expect(output).toContain("Could not remove networks: docker daemon is unreachable");
      } finally {
        process.chdir(originalCwd);
        rmSync(tempDir, { recursive: true, force: true });
        log.mockRestore();
      }
    });

    it("includes pruned networks in machine output and suppresses human logs in JSON mode", async () => {
      const tempDir = setupTestProject();
      pruneProjectNetworksMock.mockReturnValue({
        removed: ["test_project_backend"],
        kept: [{ name: "test_project_proxy", reason: "network in use" }],
      });
      const emitMock = vi.fn();
      createJsonEmitterMock.mockReturnValue(emitMock);
      const log = vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        await downCommand.parseAsync(["node", "flisk", "--prune-networks", "--json"], {
          from: "node",
        });

        expect(pruneProjectNetworksMock).toHaveBeenCalledTimes(1);
        expect(pruneProjectNetworksMock).toHaveBeenCalledWith("test-project");

        const logged = log.mock.calls.map((c) => c.join(" ")).join("\n");
        expect(logged).not.toContain("Removed networks:");
        expect(logged).not.toContain("Kept network");

        expect(emitMock).toHaveBeenCalledWith(
          expect.objectContaining({
            ok: true,
            removedNetworks: ["test_project_backend"],
            keptNetworks: [{ name: "test_project_proxy", reason: "network in use" }],
          }),
        );
      } finally {
        process.chdir(originalCwd);
        rmSync(tempDir, { recursive: true, force: true });
        log.mockRestore();
      }
    });

    it("does not throw or print human warning in JSON mode when prune fails", async () => {
      const tempDir = setupTestProject();
      pruneProjectNetworksMock.mockImplementation(() => {
        throw new Error("docker daemon is unreachable");
      });
      const emitMock = vi.fn();
      createJsonEmitterMock.mockReturnValue(emitMock);
      const log = vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        await expect(
          downCommand.parseAsync(["node", "flisk", "--prune-networks", "--json"], {
            from: "node",
          }),
        ).resolves.not.toThrow();

        const logged = log.mock.calls.map((c) => c.join(" ")).join("\n");
        expect(logged).not.toContain("Could not remove networks");

        expect(emitMock).toHaveBeenCalledWith(
          expect.objectContaining({
            ok: true,
          }),
        );
        const emitted = emitMock.mock.calls[0]?.[0];
        expect(emitted?.removedNetworks).toBeUndefined();
        expect(emitted?.keptNetworks).toBeUndefined();
      } finally {
        process.chdir(originalCwd);
        rmSync(tempDir, { recursive: true, force: true });
        log.mockRestore();
      }
    });

    it("does not invoke network pruning when --prune-networks is omitted", async () => {
      const tempDir = setupTestProject();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        await downCommand.parseAsync(["node", "flisk"], { from: "node" });

        expect(pruneProjectNetworksMock).not.toHaveBeenCalled();
      } finally {
        process.chdir(originalCwd);
        rmSync(tempDir, { recursive: true, force: true });
        log.mockRestore();
      }
    });
  });

  describe("Docker build cache pruning (--prune-cache)", () => {
    it("runs build cache prune with --yes and emits prunedCache in json mode", async () => {
      const tempDir = setupTestProject();
      pruneDockerBuildCacheMock.mockResolvedValue({ reclaimed: "2.6GB", until: "24h" });
      const emitMock = vi.fn();
      createJsonEmitterMock.mockReturnValue(emitMock);
      const log = vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        await downCommand.parseAsync(["node", "flisk", "--prune-cache", "-y", "--json"], {
          from: "node",
        });

        expect(pruneDockerBuildCacheMock).toHaveBeenCalledWith({ until: "24h" });
        expect(emitMock).toHaveBeenCalledWith(
          expect.objectContaining({
            ok: true,
            prunedCache: { until: "24h", reclaimed: "2.6GB" },
          }),
        );
      } finally {
        process.chdir(originalCwd);
        rmSync(tempDir, { recursive: true, force: true });
        log.mockRestore();
      }
    });

    it("skips cache prune when non-interactive without --yes", async () => {
      const tempDir = setupTestProject();
      const emitMock = vi.fn();
      createJsonEmitterMock.mockReturnValue(emitMock);
      const log = vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        await downCommand.parseAsync(["node", "flisk", "--prune-cache", "--json"], {
          from: "node",
        });

        expect(pruneDockerBuildCacheMock).not.toHaveBeenCalled();
        expect(emitMock).toHaveBeenCalledWith(
          expect.objectContaining({
            ok: true,
            prunedCache: expect.objectContaining({
              until: "24h",
              skipped: true,
              reason: expect.stringContaining("confirmation required"),
            }),
          }),
        );
      } finally {
        process.chdir(originalCwd);
        rmSync(tempDir, { recursive: true, force: true });
        log.mockRestore();
      }
    });

    it("supports custom age filter via --cache-until", async () => {
      const tempDir = setupTestProject();
      pruneDockerBuildCacheMock.mockResolvedValue({ reclaimed: "1.2GB", until: "48h" });
      const emitMock = vi.fn();
      createJsonEmitterMock.mockReturnValue(emitMock);
      const log = vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        await downCommand.parseAsync(
          ["node", "flisk", "--prune-cache", "--cache-until", "48h", "-y", "--json"],
          { from: "node" },
        );

        expect(pruneDockerBuildCacheMock).toHaveBeenCalledWith({ until: "48h" });
        expect(emitMock).toHaveBeenCalledWith(
          expect.objectContaining({
            prunedCache: { until: "48h", reclaimed: "1.2GB" },
          }),
        );
      } finally {
        process.chdir(originalCwd);
        rmSync(tempDir, { recursive: true, force: true });
        log.mockRestore();
      }
    });

    it("emits wouldPruneCache in dry-run without executing prune", async () => {
      const tempDir = setupTestProject();
      const emitMock = vi.fn();
      createJsonEmitterMock.mockReturnValue(emitMock);
      const log = vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        await downCommand.parseAsync(["node", "flisk", "--dry-run", "--prune-cache", "--json"], {
          from: "node",
        });

        expect(pruneDockerBuildCacheMock).not.toHaveBeenCalled();
        expect(emitMock).toHaveBeenCalledWith(
          expect.objectContaining({
            ok: true,
            dryRun: true,
            wouldPruneCache: { until: "24h" },
          }),
        );
      } finally {
        process.chdir(originalCwd);
        rmSync(tempDir, { recursive: true, force: true });
        log.mockRestore();
      }
    });

    it("rejects invalid cache-until duration format with error", async () => {
      const tempDir = setupTestProject();
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const exit = vi.spyOn(process, "exit").mockImplementation((() => {
        throw new Error("exit:1");
      }) as never);

      try {
        await expect(
          downCommand.parseAsync(
            ["node", "flisk", "--prune-cache", "--cache-until", "invalid_age"],
            { from: "node" },
          ),
        ).rejects.toThrow("exit:1");

        expect(pruneDockerBuildCacheMock).not.toHaveBeenCalled();
        const errOutput = error.mock.calls.flat().join("\n");
        expect(errOutput).toContain("Invalid --cache-until format");
      } finally {
        process.chdir(originalCwd);
        rmSync(tempDir, { recursive: true, force: true });
        exit.mockRestore();
        error.mockRestore();
      }
    });

    it("gracefully catches prune error without failing flisk down", async () => {
      const tempDir = setupTestProject();
      pruneDockerBuildCacheMock.mockRejectedValue(new Error("docker daemon disconnected"));
      const emitMock = vi.fn();
      createJsonEmitterMock.mockReturnValue(emitMock);
      const log = vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        await downCommand.parseAsync(["node", "flisk", "--prune-cache", "-y", "--json"], {
          from: "node",
        });

        expect(emitMock).toHaveBeenCalledWith(
          expect.objectContaining({
            ok: true,
            prunedCache: expect.objectContaining({
              until: "24h",
              skipped: true,
              reason: "docker daemon disconnected",
            }),
          }),
        );
      } finally {
        process.chdir(originalCwd);
        rmSync(tempDir, { recursive: true, force: true });
        log.mockRestore();
      }
    });
  });

  describe("when tilt down fails (#2899)", () => {
    it("stops the project's Compose projects instead, says so, and succeeds", async () => {
      const tempDir = setupTestProject();
      runTiltMock.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "" });
      stopProjectComposeProjectsMock.mockReturnValue({
        stopped: ["test-project-shop-autogenerated", "test-project-traefik"],
        failed: [],
      });
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
      try {
        await downCommand.parseAsync(["node", "flisk"], { from: "node" });
        expect(stopProjectComposeProjectsMock).toHaveBeenCalledWith(realpathSync(tempDir));
        expect(exit).not.toHaveBeenCalled();
        const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
        expect(output).toContain(
          "tilt down failed (exit 1); stopped this project's containers with docker compose down instead: test-project-shop-autogenerated, test-project-traefik",
        );
      } finally {
        process.chdir(originalCwd);
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("reports the fallback in JSON", async () => {
      const tempDir = setupTestProject();
      runTiltMock.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "" });
      stopProjectComposeProjectsMock.mockReturnValue({
        stopped: ["test-project-traefik"],
        failed: [],
      });
      const emitMock = vi.fn();
      createJsonEmitterMock.mockReturnValue(emitMock);
      vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await downCommand.parseAsync(["node", "flisk", "--json"], { from: "node" });
        expect(emitMock).toHaveBeenCalledWith(
          expect.objectContaining({
            ok: true,
            composeFallback: { tiltDownExitCode: 1, stopped: ["test-project-traefik"] },
          }),
        );
      } finally {
        process.chdir(originalCwd);
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("still fails when Docker refuses to stop one of them", async () => {
      const tempDir = setupTestProject();
      runTiltMock.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "" });
      stopProjectComposeProjectsMock.mockReturnValue({
        stopped: [],
        failed: [{ name: "test-project-traefik", reason: "permission denied" }],
      });
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "log").mockImplementation(() => {});
      const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
        throw new Error(`exit ${code}`);
      }) as never);
      try {
        await expect(downCommand.parseAsync(["node", "flisk"], { from: "node" })).rejects.toThrow(
          "exit 1",
        );
        expect(exit).toHaveBeenCalledWith(1);
        const output = error.mock.calls.map((call) => call.join(" ")).join("\n");
        expect(output).toContain(
          "Could not stop Compose project test-project-traefik: permission denied",
        );
      } finally {
        process.chdir(originalCwd);
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("does not run the fallback when tilt down succeeds", async () => {
      const tempDir = setupTestProject();
      vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await downCommand.parseAsync(["node", "flisk"], { from: "node" });
        expect(stopProjectComposeProjectsMock).not.toHaveBeenCalled();
      } finally {
        process.chdir(originalCwd);
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
