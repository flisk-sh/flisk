// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runTiltMock, buildTiltDownArgsMock, getContainerRuntimeStatusMock, isTiltAvailableMock } =
  vi.hoisted(() => ({
    runTiltMock: vi.fn(),
    buildTiltDownArgsMock: vi.fn(),
    getContainerRuntimeStatusMock: vi.fn(() => "missing" as "running" | "unresponsive" | "missing"),
    isTiltAvailableMock: vi.fn(async () => false),
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

import { buildTiltDownArgs } from "../../utils/tilt.js";
import { downCommand } from "../down.js";

describe("tdk down", () => {
  beforeEach(() => {
    getContainerRuntimeStatusMock.mockReset().mockReturnValue("missing");
    isTiltAvailableMock.mockReset().mockResolvedValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    runTiltMock.mockReset();
    for (const option of ["dryRun", "json", "verbose", "force", "yes", "pruneNetworks"]) {
      downCommand.setOptionValue(option, false);
    }
  });

  it("prints the shared project-root error before checking prerequisites outside a project", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "tdk-down-test-"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit:1");
    }) as never);
    process.chdir(tempDir);

    try {
      await expect(downCommand.parseAsync(["node", "tdk"], { from: "node" })).rejects.toThrow(
        "exit:1",
      );

      const output = error.mock.calls.flat().join("\n");
      expect(output).toContain("Could not find project root (no .tdk/project.json found)");
      expect(output).toContain("Run this from within a TDK project");
      expect(output).toContain("Run `tdk project --yes` to initialize a new project");
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
    const tempDir = mkdtempSync(join(tmpdir(), "tdk-down-json-test-"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit:1");
    }) as never);
    process.chdir(tempDir);

    try {
      await expect(
        downCommand.parseAsync(["node", "tdk", "--json"], { from: "node" }),
      ).rejects.toThrow("exit:1");

      expect(log).toHaveBeenCalledTimes(1);
      const report = JSON.parse(String(log.mock.calls[0]?.[0]));
      expect(report).toMatchObject({
        schemaVersion: 1,
        data: null,
        errors: [
          {
            code: "COMMAND_FAILED",
            message: "Could not find project root (no .tdk/project.json found)",
            suggestions: [
              "Run this from within a TDK project",
              "Run `tdk project --yes` to initialize a new project",
            ],
          },
        ],
      });
      expect(error).toHaveBeenCalledWith(
        "Could not find project root (no .tdk/project.json found)",
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
    const tempDir = mkdtempSync(join(tmpdir(), "tdk-down-dry-run-test-"));
    mkdirSync(join(tempDir, ".tdk"), { recursive: true });
    writeFileSync(join(tempDir, ".tdk", "project.json"), "{}");
    process.chdir(tempDir);
    getContainerRuntimeStatusMock.mockReturnValue("running");
    isTiltAvailableMock.mockResolvedValue(true);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await downCommand.parseAsync(["node", "tdk", "--dry-run"], { from: "node" });

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
    const tempDir = mkdtempSync(join(tmpdir(), "tdk-down-force-test-"));
    mkdirSync(join(tempDir, ".tdk"), { recursive: true });
    writeFileSync(join(tempDir, ".tdk", "project.json"), "{}");
    process.chdir(tempDir);
    getContainerRuntimeStatusMock.mockReturnValue("running");
    isTiltAvailableMock.mockResolvedValue(true);
    buildTiltDownArgsMock.mockReturnValue(["-f", "/fake/Tiltfile"]);
    runTiltMock.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await downCommand.parseAsync(["node", "tdk", "--force"], { from: "node" });

      expect(downCommand.opts().yes).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "Note: --force (-f) on tdk down is deprecated; use --yes (-y) instead.",
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
    const tempDir = mkdtempSync(join(tmpdir(), "tdk-down-force-short-test-"));
    mkdirSync(join(tempDir, ".tdk"), { recursive: true });
    writeFileSync(join(tempDir, ".tdk", "project.json"), "{}");
    process.chdir(tempDir);
    getContainerRuntimeStatusMock.mockReturnValue("running");
    isTiltAvailableMock.mockResolvedValue(true);
    buildTiltDownArgsMock.mockReturnValue(["-f", "/fake/Tiltfile"]);
    runTiltMock.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await downCommand.parseAsync(["node", "tdk", "-f"], { from: "node" });

      expect(downCommand.opts().yes).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "Note: --force (-f) on tdk down is deprecated; use --yes (-y) instead.",
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
    const tempDir = mkdtempSync(join(tmpdir(), "tdk-down-yes-test-"));
    mkdirSync(join(tempDir, ".tdk"), { recursive: true });
    writeFileSync(join(tempDir, ".tdk", "project.json"), "{}");
    process.chdir(tempDir);
    getContainerRuntimeStatusMock.mockReturnValue("running");
    isTiltAvailableMock.mockResolvedValue(true);
    buildTiltDownArgsMock.mockReturnValue(["-f", "/fake/Tiltfile"]);
    runTiltMock.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await downCommand.parseAsync(["node", "tdk", "-y"], { from: "node" });

      expect(downCommand.opts().yes).toBe(true);
      expect(warn).not.toHaveBeenCalled();
      expect(runTiltMock).toHaveBeenCalledWith(
        "down",
        ["-f", "/fake/Tiltfile"],
        expect.any(Object),
      );

      downCommand.setOptionValue("yes", false);
      warn.mockClear();

      await downCommand.parseAsync(["node", "tdk", "--yes"], { from: "node" });

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
});
