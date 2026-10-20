// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkDockerRuntime: vi.fn(),
  checkDockerCompose: vi.fn(),
  checkDockerVersions: vi.fn(),
  checkTilt: vi.fn(),
  findOnPath: vi.fn(),
  execFileSync: vi.fn(),
  generateMasterConfigs: vi.fn(async () => {}),
  ensureEnvFile: vi.fn(() => false),
  completeEnvFile: vi.fn(() => [] as string[]),
  validateEnvFile: vi.fn(() => ({ missing: [] as string[], invalid: [], warnings: [] })),
  ensureGitignore: vi.fn(() => [] as string[]),
  runCommand: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

// The machine has Bun but no Docker daemon and no Tilt, the way a devcontainer
// or a remote shell looks before the local runtime is started.
vi.mock("../doctor.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../doctor.js")>()),
  checkDockerRuntime: mocks.checkDockerRuntime,
  checkDockerCompose: mocks.checkDockerCompose,
  checkDockerVersions: mocks.checkDockerVersions,
  checkTilt: mocks.checkTilt,
}));
vi.mock("../../utils/which.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/which.js")>()),
  findOnPath: mocks.findOnPath,
}));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFileSync: mocks.execFileSync,
}));
vi.mock("../../utils/paths.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths.js")>()),
  findProjectRoot: vi.fn(() => null),
}));
vi.mock("../../generator/template-engine.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../generator/template-engine.js")>()),
  generateMasterConfigs: mocks.generateMasterConfigs,
}));
vi.mock("../../utils/env-validator.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/env-validator.js")>()),
  ensureEnvFile: mocks.ensureEnvFile,
  completeEnvFile: mocks.completeEnvFile,
  validateEnvFile: mocks.validateEnvFile,
}));
vi.mock("../../utils/file-helpers.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/file-helpers.js")>()),
  ensureGitignore: mocks.ensureGitignore,
}));
vi.mock("../../utils/errors.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/errors.js")>()),
  runCommand: mocks.runCommand,
  showErrorAndExit: vi.fn(),
}));

import { projectCommand } from "../project.js";

class ProcessExit extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
  }
}

const runProject = async (options: Record<string, unknown>, template?: string) => {
  projectCommand.setOptionValue("yes", Boolean(options.yes));
  projectCommand.setOptionValue("force", Boolean(options.force));
  projectCommand.setOptionValue("check", Boolean(options.check));
  projectCommand.setOptionValue("configFile", options.configFile);
  projectCommand.setOptionValue("path", options.path);

  const handler = (projectCommand as unknown as { _actionHandler: (args: unknown[]) => unknown })
    ._actionHandler;
  return handler.call(projectCommand, [template]);
};

let root = "";
let originalCwd = "";
let exitSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

function output(): string {
  return logSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
}

function errorOutput(): string {
  return errorSpy.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "tdk-project-no-runtime-")));
  originalCwd = process.cwd();
  process.chdir(root);
  mocks.checkDockerRuntime.mockResolvedValue({
    name: "Docker Runtime",
    didPass: false,
    message: "Docker daemon is not running",
    fix: "Start Docker Desktop, OrbStack, or Colima, then retry: tdk doctor",
  });
  mocks.checkDockerCompose.mockResolvedValue({
    name: "Docker Compose",
    didPass: false,
    message: "Docker Compose plugin not found",
  });
  mocks.checkDockerVersions.mockResolvedValue({
    name: "Docker Versions",
    didPass: true,
    isSkipped: true,
    message: "Could not read Docker Engine/Compose versions - skipped version check",
  });
  mocks.checkTilt.mockResolvedValue({
    name: "Tilt",
    didPass: false,
    message: "Tilt CLI not found",
    fix: "curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash",
  });
  mocks.findOnPath.mockImplementation((command: string) =>
    command === "bun" ? "/usr/local/bin/bun" : null,
  );
  mocks.execFileSync.mockReturnValue("1.4.3");
  exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new ProcessExit(code ?? 0);
  }) as never);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.chdir(originalCwd);
  exitSpy.mockRestore();
  logSpy.mockRestore();
  errorSpy.mockRestore();
  vi.clearAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("tdk project without a local runtime", () => {
  it("creates the project configuration while Docker is stopped and Tilt is missing", async () => {
    await runProject({ check: false, force: false, yes: true });

    expect(existsSync(join(root, ".tdk", "project.json"))).toBe(true);
    expect(mocks.generateMasterConfigs).toHaveBeenCalledWith(root);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("never probes Docker or Tilt while setting the project up", async () => {
    await runProject({ check: false, force: false, yes: true });

    expect(mocks.checkDockerRuntime).not.toHaveBeenCalled();
    expect(mocks.checkDockerCompose).not.toHaveBeenCalled();
    expect(mocks.checkTilt).not.toHaveBeenCalled();
  });

  it("prints a next-step hint for the runtime that is still missing", async () => {
    await runProject({ check: false, force: false, yes: true });

    expect(output()).toContain("Tilt is not installed");
    expect(output()).toContain("tdk doctor");
    expect(output()).toContain("tdk up");
  });

  it("clones a starter template while Docker is stopped and Tilt is missing", async () => {
    await runProject({ check: false, force: false, yes: true }, "example");

    expect(existsSync(join(root, "tdk-example", "services"))).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("still blocks the setup when Bun is missing, because the scaffold scope keeps the Bun check", async () => {
    mocks.findOnPath.mockImplementation(() => null);

    await expect(runProject({ check: false, force: false, yes: true })).rejects.toThrow(
      "process.exit(1)",
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorOutput()).toContain("Project setup blocked. Bun 1.2+ must be installed on PATH.");
    expect(errorOutput()).toContain("FAIL bun");
    // Nothing is written before the gate blocks.
    expect(existsSync(join(root, ".tdk", "project.json"))).toBe(false);
  });
});
