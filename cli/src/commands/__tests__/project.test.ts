// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeResource } from "../../test-support/index.js";
import type { DiscoveredResource, ProjectConfig } from "../../types/index.js";
import { MASTER_CONFIG_FILES } from "../../utils/constants.js";
import { FliskError } from "../../utils/errors.js";
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
  showErrorAndExit: vi.fn((_msg: string) => {
    throw new ProcessExit(1);
  }),
  installAgentSkills: vi.fn(() => ["flisk-build"]),
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
  showErrorAndExit: mocks.showErrorAndExit,
}));
vi.mock("../../utils/agent-skills.js", () => ({
  installAgentSkills: mocks.installAgentSkills,
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
  projectCommand.setOptionValue("quiet", Boolean(options.quiet));
  if (options.agentSkills !== undefined) {
    projectCommand.setOptionValue("agentSkills", options.agentSkills);
  } else {
    projectCommand.setOptionValue("agentSkills", true);
  }

  const handler = (projectCommand as unknown as { _actionHandler: (args: unknown[]) => unknown })
    ._actionHandler;
  return handler.call(projectCommand, [template]);
};

let root = "";
let exitSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "flisk-project-command-"));
  mocks.findProjectRoot.mockReturnValue(root);
  mocks.assertMachineReadyOrExit.mockResolvedValue(undefined);
  mocks.generateMasterConfigs.mockResolvedValue(undefined);
  mocks.ensureEnvFile.mockReturnValue(false);
  mocks.completeEnvFile.mockReturnValue([]);
  mocks.validateEnvFile.mockReturnValue({ missing: [], invalid: [], warnings: [] });
  mocks.ensureGitignore.mockReturnValue([]);
  mocks.promptConfirm.mockResolvedValue(true);
  mocks.installAgentSkills.mockReturnValue(["flisk-build"]);
  mocks.showErrorAndExit.mockImplementation((_msg: string) => {
    throw new ProcessExit(1);
  });
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

const projectJsonPath = () => join(root, ".flisk", "project.json");

function writeProjectConfig(config: ProjectConfig): string {
  mkdirSync(join(root, ".flisk"), { recursive: true });
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
  const outDir = join(root, ".flisk", ".flisk-out");
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
    expect(mocks.showDetail).toHaveBeenCalledWith(".flisk/project.json (not found)", 3);
  });

  it("regenerates master configs and completes an existing .env", async () => {
    writeProjectConfig(projectConfig(["platform"]));
    mocks.completeEnvFile.mockReturnValue(["JWT_SECRET"]);
    mocks.ensureGitignore.mockReturnValue([".env"]);

    await runProject({ check: false, force: false, yes: false });

    expect(mocks.generateMasterConfigs).toHaveBeenCalledWith(root, { quiet: false });
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
    expect(config.project.name).toContain("flisk-project-command-");
    expect(mocks.promptText).not.toHaveBeenCalled();
    expect(mocks.generateMasterConfigs).toHaveBeenCalledWith(root, { quiet: false });
    expect(mocks.ensureEnvFile).toHaveBeenCalledWith(root);
  });

  it("prints nothing but the files it writes when asked to be quiet", async () => {
    await runProject({ check: false, force: false, yes: true, quiet: true });

    expect(mocks.generateMasterConfigs).toHaveBeenCalledWith(root, { quiet: true });
    expect(mocks.showCommandHeader).not.toHaveBeenCalled();
    expect(mocks.showStep).not.toHaveBeenCalled();
    expect(mocks.showDetail).not.toHaveBeenCalled();
    expect(mocks.showSuccess).not.toHaveBeenCalled();
    expect(readProjectConfig().project.name).toContain("flisk-project-command-");
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
    expect(readProjectConfig().project.name).toContain("flisk-project-command-");
    expect(mocks.generateMasterConfigs).toHaveBeenCalledWith(root, { quiet: false });
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

  it("handles existing project: preserves project.json, regenerates configs, and avoids prompts", async () => {
    const initialConfig = projectConfig(["platform", "api"]);
    const originalJson = writeProjectConfig(initialConfig);
    writeMasterConfigs();
    mocks.ensureEnvFile.mockReturnValue(false);
    mocks.completeEnvFile.mockReturnValue([]);

    await runProject({ check: false, force: false, yes: false });

    expect(mocks.showSuccess).toHaveBeenCalledWith(".flisk/project.json exists");
    expect(mocks.promptConfirm).not.toHaveBeenCalled();
    expect(mocks.promptText).not.toHaveBeenCalled();
    expect(mocks.promptMultiSelect).not.toHaveBeenCalled();
    expect(readFileSync(projectJsonPath(), "utf-8")).toBe(originalJson);
    expect(mocks.generateMasterConfigs).toHaveBeenCalledWith(root, { quiet: false });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Project configuration regenerated!"),
    );
  });

  it("handles existing project: reports when .env is newly created", async () => {
    writeProjectConfig(projectConfig(["platform"]));
    mocks.ensureEnvFile.mockReturnValue(true);

    await runProject({ check: false, force: false, yes: false });

    expect(mocks.showSuccess).toHaveBeenCalledWith(".flisk/project.json exists");
    expect(mocks.showSuccess).toHaveBeenCalledWith("Created: .env (the defaults work as-is)");
    expect(mocks.completeEnvFile).not.toHaveBeenCalled();
  });

  it("handles existing project: auto-enables discovered service stacks", async () => {
    mkdirSync(join(root, "services/shop/orders"), { recursive: true });
    writeFileSync(
      join(root, "services/shop/orders/service.json"),
      JSON.stringify({
        name: "orders",
        appName: "orders",
        appType: "backend",
        runtime: "node",
        stack: "shop",
      }),
    );
    writeProjectConfig(projectConfig(["platform"]));

    await runProject({ check: false, force: false, yes: false });

    expect(mocks.showDetail).toHaveBeenCalledWith(
      "Auto-enabled discovered service stacks: shop",
      0,
    );
    expect(readProjectConfig().phases.pre_alpha.enabledStacks).toEqual(["platform", "shop"]);
  });

  it("loads configuration from an existing --config-file without prompting", async () => {
    const customConfig = projectConfig(["custom-stack"]);
    customConfig.project.name = "from-config-file";
    const customPath = join(root, "custom-config.json");
    writeFileSync(customPath, JSON.stringify(customConfig, null, 2));

    await runProject({ check: false, force: false, yes: false, configFile: customPath });

    expect(mocks.showSuccess).toHaveBeenCalledWith(`Loaded config from: ${customPath}`);
    expect(mocks.promptText).not.toHaveBeenCalled();
    expect(readProjectConfig().project.name).toBe("from-config-file");
    expect(readProjectConfig().phases.pre_alpha.enabledStacks).toEqual(["custom-stack"]);
    expect(mocks.generateMasterConfigs).toHaveBeenCalledWith(root, { quiet: false });
  });

  it("reports error and exits when --config-file does not exist", async () => {
    const missingFile = join(root, "missing-file.json");

    await expect(
      runProject({ check: false, force: false, yes: false, configFile: missingFile }),
    ).rejects.toBeInstanceOf(FliskError);
    await expect(
      runProject({ check: false, force: false, yes: false, configFile: missingFile }),
    ).rejects.toThrow(`Config file not found: ${missingFile}`);
  });

  it("warns when required environment variables are missing from .env", async () => {
    mocks.validateEnvFile.mockReturnValue({
      missing: ["DATABASE_URL", "STRIPE_SECRET_KEY"],
      invalid: [],
      warnings: [],
    });

    await runProject({ check: false, force: false, yes: true });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Missing required environment variables:"),
    );
    expect(mocks.showDetail).toHaveBeenCalledWith("- DATABASE_URL", 1);
    expect(mocks.showDetail).toHaveBeenCalledWith("- STRIPE_SECRET_KEY", 1);
    expect(mocks.showDetail).toHaveBeenCalledWith(
      "→ Edit .env and fill in these values before running `flisk up`",
      1,
    );
  });

  it("runs interactive project wizard and builds configuration from user prompts", async () => {
    mocks.promptText
      .mockResolvedValueOnce("interactive-app")
      .mockResolvedValueOnce("2.0.0-beta")
      .mockResolvedValueOnce("services/*/*");
    mocks.promptMultiSelect
      .mockResolvedValueOnce(["infra"])
      .mockResolvedValueOnce(["api"])
      .mockResolvedValueOnce(["worker"])
      .mockResolvedValueOnce(["monitoring", "elk"]);

    await runProject({ check: false, force: false, yes: false });

    expect(mocks.showStep).toHaveBeenCalledWith("📝 Project Setup Wizard\n");
    const savedConfig = readProjectConfig();
    expect(savedConfig.project.name).toBe("interactive-app");
    expect(savedConfig.project.version).toBe("2.0.0-beta");
    expect(savedConfig.phases.pre_alpha.enabledStacks).toEqual(["infra"]);
    expect(savedConfig.phases.alpha.enabledStacks).toEqual(["api"]);
    expect(savedConfig.phases.beta.enabledStacks).toEqual(["worker"]);
    expect(savedConfig.optional_infra.monitoring).toBe(true);
    expect(savedConfig.optional_infra.elk).toBe(true);
    expect(savedConfig.optional_infra.verdaccio).toBe(false);
    expect(savedConfig.discovery.paths).toEqual(["services/*/*"]);
    expect(mocks.generateMasterConfigs).toHaveBeenCalledWith(root, { quiet: false });
  });

  it("reports found .env when env file already exists during initial setup", async () => {
    mocks.ensureEnvFile.mockReturnValue(false);
    mocks.completeEnvFile.mockReturnValue([]);

    await runProject({ check: false, force: false, yes: true });

    expect(mocks.showSuccess).toHaveBeenCalledWith("Found: .env (environment already configured)");
  });

  it("warns when agent skills installation throws", async () => {
    mocks.installAgentSkills.mockImplementation(() => {
      throw new Error("disk full");
    });

    await runProject({ check: false, force: false, yes: true });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Could not add the agent skills: disk full"),
    );
  });

  it("skips agent skills installation when agentSkills option is false", async () => {
    await runProject({ check: false, force: false, yes: true, agentSkills: false });

    expect(mocks.installAgentSkills).not.toHaveBeenCalled();
  });

  it("reports created .env and added .gitignore during initial setup", async () => {
    mocks.ensureEnvFile.mockReturnValue(true);
    mocks.ensureGitignore.mockReturnValue([".env"]);

    await runProject({ check: false, force: false, yes: true });

    expect(mocks.showSuccess).toHaveBeenCalledWith("Created: .env (the defaults work as-is)");
    expect(mocks.showSuccess).toHaveBeenCalledWith("Added to .gitignore: .env");
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

describe("project command alias", () => {
  it("answers to `init` as well as `project`", () => {
    expect(projectCommand.name()).toBe("project");
    expect(projectCommand.aliases()).toContain("init");
  });
});
