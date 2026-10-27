// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
} = vi.hoisted(() => ({
  runTiltMock: vi.fn(),
  buildTiltDownArgsMock: vi.fn(),
  getContainerRuntimeStatusMock: vi.fn(() => "missing" as "running" | "unresponsive" | "missing"),
  isTiltAvailableMock: vi.fn(async () => false),
  pruneProjectNetworksMock: vi.fn(),
  stopProjectTiltUpMock: vi.fn(() => [] as number[]),
  waitForTiltUpExitMock: vi.fn(async () => true),
  createJsonEmitterMock: vi.fn(),
}));
const originalCwd = process.cwd();

vi.mock("../../utils/docker.js", () => ({
  getContainerRuntimeStatus: getContainerRuntimeStatusMock,
}));

vi.mock("../../utils/tilt.js", () => ({
  buildTiltDownArgs: buildTiltDownArgsMock,
  getTiltfilePath: vi.fn(),
  isTiltAvailable: isTiltAvailableMock,
  runTilt: runTiltMock,
}));

vi.mock("../../utils/down-cleanup.js", () => ({
  pruneProjectNetworks: pruneProjectNetworksMock,
  stopProjectTiltUp: stopProjectTiltUpMock,
  waitForTiltUpExit: waitForTiltUpExitMock,
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    runTiltMock.mockReset();
    for (const option of ["dryRun", "json", "verbose", "force", "yes", "pruneNetworks"]) {
      downCommand.setOptionValue(option, false);
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
});
