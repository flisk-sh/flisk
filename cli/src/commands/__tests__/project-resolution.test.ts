// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { findRunningFliskProjectsMock } = vi.hoisted(() => ({
  findRunningFliskProjectsMock: vi.fn(async (): Promise<string[]> => []),
}));

vi.mock("../../utils/down-cleanup.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/down-cleanup.js")>();
  return {
    ...actual,
    findRunningFliskProjects: findRunningFliskProjectsMock,
  };
});

const tilt = vi.hoisted(() => ({
  isTiltAvailable: vi.fn(async () => true),
  runTilt: vi.fn(async () => ({ exitCode: 0, stdout: "", stderr: "" })),
  buildTiltDownArgs: vi.fn(() => ["-f", "/fake/Tiltfile"]),
}));

const docker = vi.hoisted(() => ({
  getContainerRuntimeStatus: vi.fn(() => "running" as const),
}));

const container = vi.hoisted(() => ({
  restartContainer: vi.fn(() => ({ exitCode: 0, stdout: "", stderr: "" })),
}));

vi.mock("../../utils/container-restart.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/container-restart.js")>();
  return {
    ...actual,
    restartContainer: container.restartContainer,
  };
});

vi.mock("../../utils/docker.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/docker.js")>();
  return {
    ...actual,
    getContainerRuntimeStatus: docker.getContainerRuntimeStatus,
  };
});

vi.mock("../../utils/host-port-config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/host-port-config.js")>();
  // The scratch projects never ran Tilt, so there is no runtime port record to resolve.
  return { ...actual, resolveRuntimeTiltPort: () => 10350 };
});

vi.mock("../../utils/tilt.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/tilt.js")>();
  return {
    ...actual,
    isTiltAvailable: tilt.isTiltAvailable,
    runTilt: tilt.runTilt,
    buildTiltDownArgs: tilt.buildTiltDownArgs,
  };
});

import { runCommandInProcess } from "../../test-support/index.js";
import { downCommand } from "../down.js";
import { logsCommand } from "../logs.js";
import { restartCommand } from "../restart.js";
import { statusCommand } from "../status.js";

function resetCommandOptions(command: Command): void {
  for (const option of command.options) {
    command.setOptionValue(option.attributeName(), option.defaultValue);
  }
  command.setOptionValue("project", undefined);
}

function createScratchProject(name: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `flisk-proj-${name}-`)));
  mkdirSync(join(dir, ".flisk"), { recursive: true });
  writeFileSync(join(dir, ".flisk", "project.json"), JSON.stringify({ name, version: "1.0.0" }));
  return dir;
}

describe("CLI project resolution (Issue #4347)", () => {
  let originalCwd: string;
  let outsideDir: string;
  let testProject: string;

  beforeAll(() => {
    originalCwd = process.cwd();
  });

  beforeEach(() => {
    findRunningFliskProjectsMock.mockReset().mockResolvedValue([]);
    outsideDir = realpathSync(mkdtempSync(join(tmpdir(), "flisk-outside-")));
    testProject = createScratchProject("my-project");
    resetCommandOptions(logsCommand);
    resetCommandOptions(restartCommand);
    resetCommandOptions(statusCommand);
    resetCommandOptions(downCommand);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(outsideDir, { recursive: true, force: true });
    rmSync(testProject, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  afterAll(() => {
    process.chdir(originalCwd);
  });

  describe("scenario 1 & 6: outside a project with running projects", () => {
    it("flisk logs outside a project with one running project exits nonzero and suggests --project", async () => {
      findRunningFliskProjectsMock.mockResolvedValue([testProject]);

      const result = await runCommandInProcess(logsCommand, [], outsideDir);

      expect(result.status).toBe(1);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toContain(testProject);
      expect(combined).toContain(`flisk logs --project ${testProject}`);
    });

    it("flisk logs outside a project with multiple running projects lists all of them", async () => {
      const proj2 = createScratchProject("second-proj");
      try {
        findRunningFliskProjectsMock.mockResolvedValue([testProject, proj2]);

        const result = await runCommandInProcess(logsCommand, [], outsideDir);

        expect(result.status).toBe(1);
        const combined = `${result.stdout}\n${result.stderr}`;
        expect(combined).toContain("2 Flisk projects are running");
        expect(combined).toContain(`flisk logs --project ${testProject}`);
        expect(combined).toContain(`flisk logs --project ${proj2}`);
      } finally {
        rmSync(proj2, { recursive: true, force: true });
      }
    });

    it("flisk restart outside a project with one running project lists running project suggestion", async () => {
      findRunningFliskProjectsMock.mockResolvedValue([testProject]);

      const result = await runCommandInProcess(restartCommand, ["web"], outsideDir);

      expect(result.status).toBe(1);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toContain(testProject);
      expect(combined).toContain(`flisk restart --project ${testProject}`);
    });

    it("flisk status outside a project with one running project lists running project suggestion", async () => {
      findRunningFliskProjectsMock.mockResolvedValue([testProject]);

      const result = await runCommandInProcess(statusCommand, [], outsideDir);

      expect(result.status).toBe(1);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toContain(testProject);
      expect(combined).toContain(`flisk status --project ${testProject}`);
    });
  });

  describe("scenario 5: outside a project with zero running projects", () => {
    it("flisk logs preserves original error message and suggestions when nothing is running", async () => {
      findRunningFliskProjectsMock.mockResolvedValue([]);

      const result = await runCommandInProcess(logsCommand, [], outsideDir);

      expect(result.status).toBe(1);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toContain("Could not find project root (no .flisk/project.json found)");
      expect(combined).toContain("Run this from within a Flisk project");
      expect(combined).toContain("Run `flisk project --yes` to initialize a new project");
    });

    it("flisk restart preserves original error message when nothing is running", async () => {
      findRunningFliskProjectsMock.mockResolvedValue([]);

      const result = await runCommandInProcess(restartCommand, ["web"], outsideDir);

      expect(result.status).toBe(1);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toContain("Could not find project root (no .flisk/project.json found)");
    });

    it("flisk status preserves original error message when nothing is running", async () => {
      findRunningFliskProjectsMock.mockResolvedValue([]);

      const result = await runCommandInProcess(statusCommand, [], outsideDir);

      expect(result.status).toBe(1);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toContain("Could not find project root (no .flisk/project.json found)");
    });
  });

  describe("scenario 2, 3, 4: explicit --project <path> works from outside directory", () => {
    it("flisk logs --project <path> resolves the target project", async () => {
      let tiltCwd: string | undefined;
      tilt.runTilt.mockImplementation(async () => {
        tiltCwd = process.cwd();
        return { exitCode: 0, stdout: "log line 1\n", stderr: "" };
      });

      const result = await runCommandInProcess(logsCommand, ["--project", testProject], outsideDir);

      expect(result.status ?? 0).toBe(0);
      expect(tiltCwd).toBe(testProject);
      expect(findRunningFliskProjectsMock).not.toHaveBeenCalled();
    });

    it("flisk restart web --project <path> resolves the target project", async () => {
      // Create a service in testProject
      mkdirSync(join(testProject, "web"), { recursive: true });
      writeFileSync(
        join(testProject, "web", "service.json"),
        JSON.stringify({ appName: "web", runtime: "nodejs", type: "backend" }),
      );

      const result = await runCommandInProcess(
        restartCommand,
        ["web", "--project", testProject],
        outsideDir,
      );

      expect(result.status ?? 0).toBe(0);
      expect(container.restartContainer).toHaveBeenCalledWith(testProject, "web", "web");
      expect(findRunningFliskProjectsMock).not.toHaveBeenCalled();
    });

    it("flisk status --project <path> resolves the target project", async () => {
      const result = await runCommandInProcess(
        statusCommand,
        ["--project", testProject],
        outsideDir,
      );

      expect(result.status ?? 0).toBe(0);
      expect(result.stdout).toContain("Flisk Status");
      expect(findRunningFliskProjectsMock).not.toHaveBeenCalled();
    });
  });

  describe("scenario 7: inside a valid project", () => {
    it("flisk logs inside a project does not consult running projects", async () => {
      findRunningFliskProjectsMock.mockResolvedValue(["/some/other/project"]);
      tilt.runTilt.mockResolvedValue({ exitCode: 0, stdout: "app logs\n", stderr: "" });

      const result = await runCommandInProcess(logsCommand, [], testProject);

      expect(result.status ?? 0).toBe(0);
      expect(findRunningFliskProjectsMock).not.toHaveBeenCalled();
    });
  });

  describe("scenario 8: backward compatibility with down", () => {
    it("flisk down continues working with single running project auto-stop", async () => {
      findRunningFliskProjectsMock.mockResolvedValue([testProject]);

      const result = await runCommandInProcess(downCommand, ["--yes"], outsideDir);

      expect(result.status ?? 0).toBe(0);
      expect(result.stdout).toContain(`stopping the one that is running: ${testProject}`);
    });
  });

  describe("scenario 9: invalid --project paths produce clean error", () => {
    it("flisk logs --project <invalid> produces appropriate error without crashing", async () => {
      const invalidPath = join(outsideDir, "nonexistent");

      const result = await runCommandInProcess(logsCommand, ["--project", invalidPath], outsideDir);

      expect(result.status).toBe(1);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toContain(`No Flisk project at ${invalidPath}`);
      expect(combined).toContain("flisk logs --project <path>");
    });

    it("flisk restart web --project <invalid> produces appropriate error without crashing", async () => {
      const invalidPath = join(outsideDir, "nonexistent");

      const result = await runCommandInProcess(
        restartCommand,
        ["web", "--project", invalidPath],
        outsideDir,
      );

      expect(result.status).toBe(1);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toContain(`No Flisk project at ${invalidPath}`);
      expect(combined).toContain("flisk restart --project <path>");
    });

    it("flisk status --project <invalid> produces appropriate error without crashing", async () => {
      const invalidPath = join(outsideDir, "nonexistent");

      const result = await runCommandInProcess(
        statusCommand,
        ["--project", invalidPath],
        outsideDir,
      );

      expect(result.status).toBe(1);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toContain(`No Flisk project at ${invalidPath}`);
      expect(combined).toContain("flisk status --project <path>");
    });
  });

  describe("explicit --project path edge cases", () => {
    it("rejects a nonexistent subpath instead of resolving to the ancestor project", async () => {
      const missing = join(testProject, "missing");

      const result = await runCommandInProcess(logsCommand, ["--project", missing], outsideDir);

      expect(result.status).toBe(1);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toContain(`No Flisk project at ${missing} (not an existing directory)`);
    });

    it("rejects a file path under a project", async () => {
      const file = join(testProject, "a.txt");
      writeFileSync(file, "x");

      const result = await runCommandInProcess(statusCommand, ["--project", file], outsideDir);

      expect(result.status).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toContain("not an existing directory");
    });

    it("shell-quotes running project paths with spaces in suggestions", async () => {
      findRunningFliskProjectsMock.mockResolvedValue(["/work/my app/it's"]);

      const result = await runCommandInProcess(logsCommand, [], outsideDir);

      expect(result.status).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "flisk logs --project '/work/my app/it'\\''s'",
      );
    });
  });

  describe("scenario 10: help documents --project", () => {
    it("flisk logs --help documents --project", () => {
      let help = "";
      logsCommand.configureOutput({ writeOut: (text) => (help += text) });
      logsCommand.outputHelp();
      expect(help).toContain("--project");
    });

    it("flisk restart --help documents --project", () => {
      let help = "";
      restartCommand.configureOutput({ writeOut: (text) => (help += text) });
      restartCommand.outputHelp();
      expect(help).toContain("--project");
    });

    it("flisk status --help documents --project", () => {
      let help = "";
      statusCommand.configureOutput({ writeOut: (text) => (help += text) });
      statusCommand.outputHelp();
      expect(help).toContain("--project");
    });
  });
});
