// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeResource } from "../../test-support/index.js";
import type { DiscoveredResource, ProjectConfig } from "../../types/index.js";
import { MASTER_CONFIG_FILES } from "../../utils/constants.js";
import { enableDiscoveredStacks, projectCommand } from "../project.js";

const mocks = vi.hoisted(() => ({
  assertMachineReadyOrExit: vi.fn(async () => {}),
  detectRuntimePrerequisites: vi.fn(() => ({ hasDockerCli: true, hasTiltCli: true })),
  formatRuntimeNextSteps: vi.fn(() => [] as string[]),
  findProjectRoot: vi.fn(),
  generateMasterConfigs: vi.fn(async () => {}),
  ensureEnvFile: vi.fn(() => false),
  completeEnvFile: vi.fn(() => [] as string[]),
  validateEnvFile: vi.fn(() => ({ missing: [] as string[], invalid: [], warnings: [] })),
  ensureGitignore: vi.fn(() => [] as string[]),
  promptConfirm: vi.fn(async () => true),
  promptText: vi.fn(async () => ""),
  promptMultiSelect: vi.fn(async () => [] as string[]),
  showCancelled: vi.fn(),
  showCommandHeader: vi.fn(),
  showDetail: vi.fn(),
  showStep: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock("../../utils/cold-preflight.js", () => ({
  assertMachineReadyOrExit: mocks.assertMachineReadyOrExit,
  detectRuntimePrerequisites: mocks.detectRuntimePrerequisites,
  formatRuntimeNextSteps: mocks.formatRuntimeNextSteps,
}));
vi.mock("../../utils/paths.js", () => ({ findProjectRoot: mocks.findProjectRoot }));
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
vi.mock("../../utils/prompt.js", () => ({
  promptConfirm: mocks.promptConfirm,
  promptText: mocks.promptText,
  promptMultiSelect: mocks.promptMultiSelect,
}));
vi.mock("../../utils/formatting.js", () => ({
  showCancelled: mocks.showCancelled,
  showCommandHeader: mocks.showCommandHeader,
  showDetail: mocks.showDetail,
  showStep: mocks.showStep,
  showSuccess: mocks.showSuccess,
}));
vi.mock("../../utils/errors.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/errors.js")>()),
  runCommand: async (fn: () => Promise<unknown>) => fn(),
  showErrorAndExit: vi.fn(),
}));

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
let exitSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tdk-project-command-"));
  mocks.findProjectRoot.mockReturnValue(root);
  mocks.assertMachineReadyOrExit.mockResolvedValue(undefined);
  mocks.generateMasterConfigs.mockResolvedValue(undefined);
  mocks.ensureEnvFile.mockReturnValue(false);
  mocks.completeEnvFile.mockReturnValue([]);
  mocks.validateEnvFile.mockReturnValue({ missing: [], invalid: [], warnings: [] });
  mocks.ensureGitignore.mockReturnValue([]);
  mocks.promptConfirm.mockResolvedValue(true);
  exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new ProcessExit(code ?? 0);
  }) as never);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  exitSpy.mockRestore();
  logSpy.mockRestore();
  vi.clearAllMocks();
  rmSync(root, { recursive: true, force: true });
});

const phase = (enabledStacks: string[] = []) => ({
  name: "phase",
  description: "phase",
  enabledStacks,
});

function projectConfig(
  preAlpha: string[],
  assigned: Partial<Record<"alpha" | "beta" | "out_of_scope", string[]>> = {},
): ProjectConfig {
  return {
    version: "1.0",
    project: { name: "fixture", version: "1.0.0" },
    phases: {
      pre_alpha: phase(preAlpha),
      alpha: phase(assigned.alpha),
      beta: phase(assigned.beta),
      out_of_scope: phase(assigned.out_of_scope),
    },
    optional_infra: {
      monitoring: false,
      elk: false,
      debezium: false,
      golden_image: true,
      verdaccio: false,
    },
    discovery: { paths: ["services/*/*"] },
    overrides: {},
  };
}

const projectJsonPath = () => join(root, ".tdk", "project.json");

function writeProjectConfig(config: ProjectConfig): string {
  mkdirSync(join(root, ".tdk"), { recursive: true });
  const content = `${JSON.stringify(config, null, 2)}\n`;
  writeFileSync(projectJsonPath(), content);
  return content;
}

function readProjectConfig(): ProjectConfig {
  return JSON.parse(readFileSync(projectJsonPath(), "utf-8")) as ProjectConfig;
}

function stackResource(stack: string, name = `${stack}-api`): DiscoveredResource {
  return { ...makeResource(name, "backend"), stack };
}

describe("enableDiscoveredStacks", () => {
  it("does nothing when the project config is missing", () => {
    expect(enableDiscoveredStacks(root, [stackResource("payments")])).toEqual([]);
  });

  it("adds newly discovered stacks to pre_alpha and persists them", () => {
    writeProjectConfig(projectConfig(["platform"]));

    const enabled = enableDiscoveredStacks(root, [
      stackResource("payments"),
      stackResource("orders"),
    ]);

    expect(enabled).toEqual(["orders", "payments"]);
    expect(readProjectConfig().phases.pre_alpha.enabledStacks).toEqual([
      "platform",
      "orders",
      "payments",
    ]);
  });

  it("does not re-enable stacks assigned to another phase", () => {
    writeProjectConfig(projectConfig([], { alpha: ["payments"] }));

    const enabled = enableDiscoveredStacks(root, [
      stackResource("payments"),
      stackResource("catalog"),
    ]);

    expect(enabled).toEqual(["catalog"]);
    expect(readProjectConfig().phases.alpha.enabledStacks).toEqual(["payments"]);
    expect(readProjectConfig().phases.pre_alpha.enabledStacks).toEqual(["catalog"]);
  });

  it("leaves the file unchanged when every stack is already assigned", () => {
    const original = writeProjectConfig(
      projectConfig(["platform"], { out_of_scope: ["payments"] }),
    );

    const enabled = enableDiscoveredStacks(root, [
      stackResource("platform"),
      stackResource("payments"),
    ]);

    expect(enabled).toEqual([]);
    expect(readFileSync(projectJsonPath(), "utf-8")).toBe(original);
  });

  it("collapses a stack discovered through several resources", () => {
    writeProjectConfig(projectConfig([]));

    const enabled = enableDiscoveredStacks(root, [
      stackResource("payments", "payments-api"),
      stackResource("payments", "payments-worker"),
    ]);

    expect(enabled).toEqual(["payments"]);
    expect(readProjectConfig().phases.pre_alpha.enabledStacks).toEqual(["payments"]);
  });
});

function writeMasterConfigs() {
  const outDir = join(root, ".tdk", ".tdk-out");
  mkdirSync(outDir, { recursive: true });
  for (const file of MASTER_CONFIG_FILES) {
    writeFileSync(join(outDir, file), "");
  }
}

describe("project command action", () => {
  it("reports a complete configuration in --check mode", async () => {
    writeProjectConfig(projectConfig(["platform"]));
    writeMasterConfigs();

    await expect(runProject({ check: true, force: false, yes: false })).rejects.toBeInstanceOf(
      ProcessExit,
    );

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mocks.showSuccess).toHaveBeenCalledWith("Project configuration is valid");
  });

  it("exits non-zero in --check mode when configuration is incomplete", async () => {
    await expect(runProject({ check: true, force: false, yes: false })).rejects.toMatchObject({
      code: 1,
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mocks.showDetail).toHaveBeenCalledWith(".tdk/project.json (not found)", 3);
  });

  it("regenerates master configs and completes an existing .env", async () => {
    writeProjectConfig(projectConfig(["platform"]));
    mocks.completeEnvFile.mockReturnValue(["JWT_SECRET"]);
    mocks.ensureGitignore.mockReturnValue([".env"]);

    await runProject({ check: false, force: false, yes: false });

    expect(mocks.generateMasterConfigs).toHaveBeenCalledWith(root);
    expect(mocks.ensureEnvFile).toHaveBeenCalledWith(root);
    expect(mocks.completeEnvFile).toHaveBeenCalledWith(root);
    expect(mocks.ensureGitignore).toHaveBeenCalledWith(root);
    expect(mocks.showSuccess).toHaveBeenCalledWith(
      "Updated: .env (added JWT_SECRET; existing values unchanged)",
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("creates a default project in non-interactive mode", async () => {
    await runProject({ check: false, force: false, yes: true });

    const config = readProjectConfig();
    expect(Object.keys(config.phases)).toEqual(["pre_alpha", "alpha", "beta", "out_of_scope"]);
    expect(config.project.name).toContain("tdk-project-command-");
    expect(mocks.promptText).not.toHaveBeenCalled();
    expect(mocks.generateMasterConfigs).toHaveBeenCalledWith(root);
    expect(mocks.ensureEnvFile).toHaveBeenCalledWith(root);
  });

  it("keeps the existing project when --force is declined", async () => {
    const original = writeProjectConfig(projectConfig([]));
    writeMasterConfigs();
    mocks.promptConfirm.mockResolvedValue(false);

    await runProject({ check: false, force: true, yes: false });

    expect(mocks.promptConfirm).toHaveBeenCalledOnce();
    expect(mocks.showCancelled).toHaveBeenCalledOnce();
    expect(readFileSync(projectJsonPath(), "utf-8")).toBe(original);
    expect(mocks.generateMasterConfigs).not.toHaveBeenCalled();
  });

  it("overwrites the project with --force --yes without prompting", async () => {
    writeProjectConfig(projectConfig(["platform"]));

    await runProject({ check: false, force: true, yes: true });

    expect(mocks.promptConfirm).not.toHaveBeenCalled();
    expect(readProjectConfig().project.name).toContain("tdk-project-command-");
    expect(mocks.generateMasterConfigs).toHaveBeenCalledWith(root);
  });

  it("checks only the scaffolding prerequisites, not the local runtime", async () => {
    await runProject({ check: false, force: false, yes: true });

    expect(mocks.assertMachineReadyOrExit).toHaveBeenCalledWith({ scope: "scaffold" });
  });

  it("prints the runtime next steps after the project is configured", async () => {
    mocks.formatRuntimeNextSteps.mockReturnValue(["Tilt is not installed. Install it."]);

    await runProject({ check: false, force: false, yes: true });

    expect(mocks.detectRuntimePrerequisites).toHaveBeenCalled();
    expect(mocks.showDetail).toHaveBeenCalledWith("Tilt is not installed. Install it.", 0);
  });
});

describe("projectCommand", () => {
  it("registers the expected arguments and options", () => {
    expect(projectCommand.name()).toBe("project");
    expect(projectCommand.registeredArguments.map((argument) => argument.name())).toEqual([
      "template",
    ]);

    const flags = projectCommand.options.map((option) => option.long);
    for (const flag of ["--yes", "--path", "--check", "--force", "--config-file"]) {
      expect(flags).toContain(flag);
    }
  });
});
