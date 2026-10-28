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
  findRunningFliskProjectsMock,
} = vi.hoisted(() => ({
  runTiltMock: vi.fn(),
  buildTiltDownArgsMock: vi.fn(),
  getContainerRuntimeStatusMock: vi.fn(() => "missing" as "running" | "unresponsive" | "missing"),
  isTiltAvailableMock: vi.fn(async () => false),
  findRunningFliskProjectsMock: vi.fn((): string[] => []),
}));
const originalCwd = process.cwd();

vi.mock("../../utils/docker.js", () => ({
  getContainerRuntimeStatus: getContainerRuntimeStatusMock,
}));

// The real lookup reads `ps`, and a stack running on the test machine must never be picked (or stopped) by a test.
vi.mock("../../utils/down-cleanup.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/down-cleanup.js")>()),
  findRunningFliskProjects: findRunningFliskProjectsMock,
}));

vi.mock("../../utils/tilt.js", () => ({
  buildTiltDownArgs: buildTiltDownArgsMock,
  getTiltfilePath: vi.fn(),
  isTiltAvailable: isTiltAvailableMock,
  runTilt: runTiltMock,
}));

import { buildTiltDownArgs } from "../../utils/tilt.js";
import { downCommand } from "../down.js";

describe("flisk down", () => {
  beforeEach(() => {
    getContainerRuntimeStatusMock.mockReset().mockReturnValue("missing");
    isTiltAvailableMock.mockReset().mockResolvedValue(false);
    findRunningFliskProjectsMock.mockReset().mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    runTiltMock.mockReset();
    for (const option of ["dryRun", "json", "verbose", "force", "yes", "pruneNetworks"]) {
      downCommand.setOptionValue(option, false);
    }
    downCommand.setOptionValue("project", undefined);
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
});
