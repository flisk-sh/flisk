// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempProject, parseEnvelope, runCommandInProcess } from "../../test-support/index.js";
import { findProjectRoot } from "../../utils/paths.js";
import { configCommand } from "../config.js";

beforeEach(() => {
  vi.stubEnv("VISUAL", "");
  // Commander keeps option values on each subcommand between parseAsync calls, so clear them before every case.
  for (const sub of configCommand.commands) {
    for (const option of sub.options) sub.setOptionValue(option.attributeName(), undefined);
  }
  vi.mocked(spawnSync).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawnSync: vi.fn(() => ({ status: 0 })),
}));

vi.mock("../../utils/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/paths.js")>();
  return { ...actual, findProjectRoot: vi.fn(actual.findProjectRoot) };
});

describe("config command", () => {
  describe("project config structure", () => {
    it("should have required project.json fields", () => {
      const expectedConfig = {
        version: "2",
        project: {
          name: "test-project",
          version: "1.0.0",
        },
        phases: {
          pre_alpha: {
            name: "pre-alpha",
            description: "Pre-alpha phase",
            enabledStacks: [],
          },
          alpha: {
            name: "alpha",
            description: "Alpha phase",
            enabledStacks: [],
          },
          beta: { name: "beta", description: "Beta phase", enabledStacks: [] },
          out_of_scope: {
            name: "out-of-scope",
            description: "Future phase",
            enabledStacks: [],
          },
        },
        optional_infra: {
          monitoring: false,
          elk: false,
          debezium: false,
          golden_image: false,
        },
        discovery: {
          paths: [],
        },
      };

      expect(expectedConfig).toHaveProperty("version");
      expect(expectedConfig).toHaveProperty("project");
      expect(expectedConfig).toHaveProperty("phases");
      expect(expectedConfig).toHaveProperty("optional_infra");
      expect(expectedConfig).toHaveProperty("discovery");

      expect(expectedConfig.project).toHaveProperty("name");
      expect(expectedConfig.project).toHaveProperty("version");
    });
  });

  describe("config verification logic", () => {
    it("should detect missing files", () => {
      const existingFiles: string[] = [];
      const requiredFiles = ["TILT_TECH_STACK.star", "TILT_RESOURCE_DEFAULTS.star", "spec.master"];

      const missingFiles = requiredFiles.filter((f) => !existingFiles.includes(f));
      expect(missingFiles).toHaveLength(3);
    });

    it("should detect when all files exist", () => {
      const existingFiles = ["TILT_TECH_STACK.star", "TILT_RESOURCE_DEFAULTS.star", "spec.master"];
      const requiredFiles = [...existingFiles];

      const missingFiles = requiredFiles.filter((f) => !existingFiles.includes(f));
      expect(missingFiles).toHaveLength(0);
    });

    it("should detect content differences", () => {
      const currentContent = '{"version": "1", "old": true}';
      const newContent = '{"version": "2", "new": true}';

      expect(currentContent).not.toBe(newContent);
    });

    it("should detect identical content", () => {
      const content = '{"version": "2"}';
      const sameContent = '{"version": "2"}';

      expect(content).toBe(sameContent);
    });
  });

  describe("template generation", () => {
    it("should generate required output files", () => {
      const expectedFiles = [
        "TILT_TECH_STACK.star",
        "TILT_RESOURCE_DEFAULTS.star",
        "spec.master",
        "Tiltfile",
      ];

      expect(expectedFiles).toContain("TILT_TECH_STACK.star");
      expect(expectedFiles).toContain("TILT_RESOURCE_DEFAULTS.star");
      expect(expectedFiles).toContain("spec.master");
      expect(expectedFiles).toContain("Tiltfile");
    });

    it("should validate TILT_TECH_STACK.star content", () => {
      const techStackContent = `
TECH_STACK = {
  BUNDLER = "bun"
  RUNTIME = "bun"
}
`;

      expect(techStackContent).toContain("TECH_STACK");
      expect(techStackContent).toContain("BUNDLER");
      expect(techStackContent).toContain("RUNTIME");
    });

    it("should validate TILT_RESOURCE_DEFAULTS.star content", () => {
      const resourceDefaultsContent = `
BASE_PORT_FRONTEND = 3000
BASE_PORT_BACKEND = 4000
HEALTH_CHECK_PATH = "/health"
`;

      expect(resourceDefaultsContent).toContain("BASE_PORT");
      expect(resourceDefaultsContent).toContain("HEALTH_CHECK");
    });
  });

  describe("diff functionality", () => {
    it("should identify new files", () => {
      const existingFiles: string[] = [];
      const newFiles = ["TILT_TECH_STACK.star", "spec.master"];

      const addedFiles = newFiles.filter((f) => !existingFiles.includes(f));
      expect(addedFiles).toEqual(["TILT_TECH_STACK.star", "spec.master"]);
    });

    it("should calculate line count differences", () => {
      const currentLines = ["line1", "line2", "line3"];
      const newLines = ["line1", "line2", "line3", "line4", "line5"];

      const lineDiff = newLines.length - currentLines.length;
      expect(lineDiff).toBe(2);
      expect(newLines.length).toBe(5);
      expect(currentLines.length).toBe(3);
    });

    it("should find first difference line", () => {
      const currentLines = ["line1", "line2", "line3"];
      const newLines = ["line1", "modified", "line3"];

      let firstDiffLine = -1;
      for (let i = 0; i < Math.max(currentLines.length, newLines.length); i++) {
        if (currentLines[i] !== newLines[i]) {
          firstDiffLine = i;
          break;
        }
      }

      expect(firstDiffLine).toBe(1);
    });
  });
});

const projectJson = (name = "config-boundaries", optionalInfra: Record<string, boolean> = {}) => ({
  version: "1.0",
  project: { name, version: "1.0.0" },
  phases: Object.fromEntries(
    ["pre_alpha", "alpha", "beta", "out_of_scope"].map((phase) => [
      phase,
      { name: phase, description: "", enabledStacks: [] },
    ]),
  ),
  optional_infra: {
    monitoring: false,
    elk: false,
    debezium: false,
    golden_image: false,
    verdaccio: false,
    ...optionalInfra,
  },
  discovery: { paths: ["services/*/*"] },
});

const serviceFile = (root: string, dir: string) => path.join(root, "services", dir, "service.json");

const readProjectJson = (root: string) =>
  JSON.parse(fs.readFileSync(path.join(root, ".flisk", "project.json"), "utf-8")) as {
    optional_infra: Record<string, boolean>;
  };

describe("config regenerate --dry-run", () => {
  it("reports every master file as NEW and writes nothing when no output exists", async () => {
    const root = createTempProject({ projectJson: projectJson() });

    const result = await runCommandInProcess(configCommand, ["regenerate", "--dry-run"], root);

    expect(result.status).toBeUndefined();
    expect(result.stdout).toContain("Dry run - comparing current files");
    // Now grouped by category; should show NEW for each group's files (actual master config files)
    expect(result.stdout).toContain("📁 TILT_TECH_STACK.star");
    expect(result.stdout).toContain("📁 TILT_RESOURCE_DEFAULTS.star");
    expect(result.stdout).toContain("📁 spec.master");
    expect(result.stdout).toContain("Run without --dry-run to apply these changes.");
    expect(fs.existsSync(path.join(root, ".flisk", ".flisk-out"))).toBe(false);
  });

  it("shows line counts and the first changed line for stale files, and truncates long lines", async () => {
    const longLine = "x".repeat(80);
    const root = createTempProject({
      projectJson: projectJson(),
      generated: {
        "TILT_TECH_STACK.star": Array.from({ length: 300 }, () => longLine).join("\n"),
        "spec.master": "stale\n",
      },
    });

    const result = await runCommandInProcess(configCommand, ["regenerate", "--dry-run"], root);

    expect(result.status).toBeUndefined();
    // New grouped output shows modifications for actual master config files
    expect(result.stdout).toContain("📝 TILT_TECH_STACK.star");
    expect(result.stdout).toContain("📝 spec.master");
    // Line count changes
    expect(result.stdout).toMatch(/Lines: \+\d+/);
    expect(result.stdout).toMatch(/Lines: -\d+/);
    // The diff output shows context around changes
    expect(result.stdout).toContain(`- ${"x".repeat(60)}...`);
    expect(result.stdout).toContain("Run without --dry-run to apply these changes.");
    // Dry run never touches the stale files.
    expect(fs.readFileSync(path.join(root, ".flisk", ".flisk-out", "spec.master"), "utf-8")).toBe(
      "stale\n",
    );
  });

  it("says everything is up to date right after a regenerate", async () => {
    const root = createTempProject({ projectJson: projectJson() });
    expect((await runCommandInProcess(configCommand, ["regenerate"], root)).status).toBeUndefined();

    const result = await runCommandInProcess(configCommand, ["regenerate", "--dry-run"], root);

    expect(result.status).toBeUndefined();
    // New grouped output shows "all up to date" for each group
    expect(result.stdout).toContain("✅ 📋 Core orchestration — all up to date");
    expect(result.stdout).toContain("✅ 📦 Project spec — all up to date");
    expect(result.stdout).toContain("All files are already up to date!");
  });

  it("fails with a runCommand error when project.json is not valid JSON", async () => {
    const root = createTempProject({ projectJson: "{invalid\n" });

    const result = await runCommandInProcess(configCommand, ["regenerate", "--dry-run"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("❌");
    expect(result.stderr).toMatch(/.*(JSON|token|property)/i);
  });
});

describe("config regenerate", () => {
  it("writes the generated files and reports success", async () => {
    const root = createTempProject({ projectJson: projectJson() });

    const result = await runCommandInProcess(configCommand, ["regenerate"], root);

    expect(result.status).toBeUndefined();
    expect(result.stdout).toContain("Regenerating master configuration files");
    expect(result.stdout).toContain("Configuration regenerated!");
    expect(result.stdout).toContain("restart it (`flisk down && flisk up`)");
    expect(fs.existsSync(path.join(root, ".flisk", ".flisk-out", "spec.master"))).toBe(true);
  });

  it("exits 1 with the project-root error outside a project", async () => {
    const root = createTempProject({ projectJson: null });

    const result = await runCommandInProcess(configCommand, ["regenerate"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Could not find project root");
  });
});

describe("config verify", () => {
  it("does not predict shared Postgres for local processes", async () => {
    const root = createTempProject({
      projectJson: projectJson(),
      resources: {
        "shop/api": {
          appType: "backend",
          stack: "shop",
          schemaVersion: 1,
          command: "node server.js",
          dependsOn: ["postgres"],
        },
      },
    });
    await runCommandInProcess(configCommand, ["regenerate"], root);

    const result = await runCommandInProcess(configCommand, ["verify"], root);

    expect(result.stdout).not.toContain("Postgres will start");
  });

  it("exits 1 and suggests regenerate when generated files are missing", async () => {
    const root = createTempProject({ projectJson: projectJson() });
    await runCommandInProcess(configCommand, ["regenerate"], root);
    fs.rmSync(path.join(root, ".flisk", ".flisk-out", "spec.master"));

    const result = await runCommandInProcess(configCommand, ["verify"], root);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Configuration issues found:");
    expect(result.stdout).toContain("Missing file: .flisk/.flisk-out/spec.master");
    expect(result.stdout).toContain("Run `flisk config regenerate` to fix generated files.");
    expect(result.stdout).not.toContain("flisk config migrate");
  });

  it("reports in sync and exits 0 after regenerate", async () => {
    const root = createTempProject({ projectJson: projectJson() });
    await runCommandInProcess(configCommand, ["regenerate"], root);

    const result = await runCommandInProcess(configCommand, ["verify"], root);

    expect(result.status).toBeUndefined();
    expect(result.stdout).toContain("All files are in sync!");
  });

  it("points a service without schemaVersion at migrate, not regenerate", async () => {
    const root = createTempProject({
      projectJson: projectJson(),
      resources: { "shop/api": { appType: "api", stack: "core" } },
    });
    await runCommandInProcess(configCommand, ["regenerate"], root);

    const result = await runCommandInProcess(configCommand, ["verify"], root);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Run `flisk config migrate` to fix schemaVersion.");
    expect(result.stdout).not.toContain("flisk config regenerate");
  });

  it("names the dependsOn target when it is not a known service or stack", async () => {
    const root = createTempProject({
      projectJson: projectJson(),
      resources: {
        "shop/api": {
          appType: "api",
          stack: "core",
          schemaVersion: 1,
          dependsOn: ["ghost"],
        },
      },
    });
    await runCommandInProcess(configCommand, ["regenerate"], root);

    const result = await runCommandInProcess(configCommand, ["verify"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('dependsOn "ghost" on');
    expect(result.stderr).toContain(
      "shared platform Postgres names are postgres and database-management",
    );
    expect(result.stdout).not.toContain('dependsOn "ghost" on');
  });

  it("prints a single JSON envelope with valid true when in sync", async () => {
    const root = createTempProject({ projectJson: projectJson() });
    await runCommandInProcess(configCommand, ["regenerate"], root);

    const result = await runCommandInProcess(configCommand, ["verify", "--json"], root);

    expect(result.status).toBeUndefined();
    expect(result.stderr).toBe("");
    expect(parseEnvelope(result.stdout)).toMatchObject({
      schemaVersion: 1,
      data: { valid: true, errors: [] },
      errors: [],
    });
  });

  it("emits a COMMAND_FAILED envelope and exits 1 with --json outside a project", async () => {
    const root = createTempProject({ projectJson: null });

    const result = await runCommandInProcess(configCommand, ["verify", "--json"], root);

    expect(result.status).toBe(1);
    expect(parseEnvelope(result.stdout)).toMatchObject({
      data: null,
      errors: [
        {
          code: "COMMAND_FAILED",
          message: expect.stringContaining("project root"),
        },
      ],
    });
  });
});

describe("config migrate", () => {
  it("adds appType from the legacy type field and stamps schemaVersion", async () => {
    const root = createTempProject({
      projectJson: projectJson(),
      resources: { "shop/api": { type: "backend", stack: "core", extra: true } },
    });

    const result = await runCommandInProcess(configCommand, ["migrate"], root);

    expect(result.status).toBeUndefined();
    expect(result.stdout).toContain("Migrated 1 service.json file to schema version 1.");
    expect(result.stdout).toContain("unknown fields were preserved");
    const migrated = JSON.parse(fs.readFileSync(serviceFile(root, "shop/api"), "utf-8")) as Record<
      string,
      unknown
    >;
    expect(migrated).toMatchObject({
      appType: "backend",
      schemaVersion: 1,
      extra: true,
    });
  });

  it("leaves a service already at the current schemaVersion alone and counts zero", async () => {
    const root = createTempProject({
      projectJson: projectJson(),
      resources: {
        "shop/api": { appType: "api", stack: "core", schemaVersion: 1 },
      },
    });
    const before = fs.readFileSync(serviceFile(root, "shop/api"));

    const result = await runCommandInProcess(configCommand, ["migrate"], root);

    expect(result.status).toBeUndefined();
    expect(result.stdout).toContain(
      "All 1 service.json files are already on schema version 1. Nothing to migrate.",
    );
    expect(result.stdout).not.toContain("Review the diff");
    expect(fs.readFileSync(serviceFile(root, "shop/api"))).toEqual(before);
  });

  it("refuses a legacy type that is not an appType and writes nothing", async () => {
    const root = createTempProject({
      projectJson: projectJson(),
      resources: { "shop/api": { type: "api", stack: "core", port: 4300 } },
    });
    const before = fs.readFileSync(serviceFile(root, "shop/api"));

    const result = await runCommandInProcess(configCommand, ["migrate"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('.appType: unknown type "api"; expected one of backend,');
    expect(fs.readFileSync(serviceFile(root, "shop/api"))).toEqual(before);
  });

  it("refuses an unsupported schemaVersion and writes nothing", async () => {
    const root = createTempProject({
      projectJson: projectJson(),
      resources: {
        "shop/api": { appType: "api", stack: "core", schemaVersion: 99 },
      },
    });
    const before = fs.readFileSync(serviceFile(root, "shop/api"));

    const result = await runCommandInProcess(configCommand, ["migrate"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("cannot migrate unsupported version 99 automatically");
    expect(fs.readFileSync(serviceFile(root, "shop/api"))).toEqual(before);
  });

  it("reports invalid JSON and a non-object document without writing either file", async () => {
    const root = createTempProject({
      projectJson: projectJson(),
      resources: { "broken/api": "{invalid\n", "list/api": "[1, 2]\n" },
    });

    const result = await runCommandInProcess(configCommand, ["migrate"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/broken[\\/]api[\\/]service\.json: /);
    expect(result.stderr).toMatch(/list[\\/]api[\\/]service\.json: expected a JSON object/);
    expect(fs.readFileSync(serviceFile(root, "broken/api"), "utf-8")).toBe("{invalid\n");
    expect(fs.readFileSync(serviceFile(root, "list/api"), "utf-8")).toBe("[1, 2]\n");
  });

  it("reports validation errors for a manifest without an app type and writes nothing", async () => {
    const root = createTempProject({
      projectJson: projectJson(),
      resources: { "shop/api": { stack: "core" } },
    });
    const before = fs.readFileSync(serviceFile(root, "shop/api"));

    const result = await runCommandInProcess(configCommand, ["migrate"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/shop[\\/]api/);
    expect(fs.readFileSync(serviceFile(root, "shop/api"))).toEqual(before);
  });
});

describe("config enable-infra and disable-infra", () => {
  it("previews both directions and leaves the project config byte-identical", async () => {
    const root = createTempProject({ projectJson: projectJson("dry", { monitoring: false }) });
    const configPath = path.join(root, ".flisk", "project.json");
    const before = fs.readFileSync(configPath, "utf8");
    const enable = await runCommandInProcess(
      configCommand,
      ["enable-infra", "monitoring", "--dry-run", "--json"],
      root,
    );
    expect(JSON.parse(enable.stdout).data).toMatchObject({
      dryRun: true,
      service: "monitoring",
      enabled: true,
    });
    expect(fs.readFileSync(configPath, "utf8")).toBe(before);

    const disable = await runCommandInProcess(
      configCommand,
      ["disable-infra", "monitoring", "--dry-run"],
      root,
    );
    expect(disable.stdout).toMatch(/Would disable monitoring|No change/);
    expect(fs.readFileSync(configPath, "utf8")).toBe(before);
  });

  it("reports an already-enabled service without rewriting project.json (#4432)", async () => {
    const root = createTempProject({
      projectJson: projectJson("already-on", { monitoring: true }),
    });
    const configPath = path.join(root, ".flisk", "project.json");
    const before = fs.readFileSync(configPath, "utf8");

    const result = await runCommandInProcess(configCommand, ["enable-infra", "monitoring"], root);

    expect(result.status).toBeUndefined();
    expect(result.stdout).toMatch(/already enabled/i);
    expect(result.stdout).not.toMatch(/regenerate/i);
    expect(fs.readFileSync(configPath, "utf8")).toBe(before);
  });

  it("reports an already-disabled service without rewriting project.json (#4432)", async () => {
    const root = createTempProject({
      projectJson: projectJson("already-off", { monitoring: false }),
    });
    const configPath = path.join(root, ".flisk", "project.json");
    const before = fs.readFileSync(configPath, "utf8");

    const result = await runCommandInProcess(configCommand, ["disable-infra", "monitoring"], root);

    expect(result.status).toBeUndefined();
    expect(result.stdout).toMatch(/already disabled/i);
    expect(result.stdout).not.toMatch(/regenerate/i);
    expect(fs.readFileSync(configPath, "utf8")).toBe(before);
  });

  it("enables a service and persists it to project.json", async () => {
    const root = createTempProject({ projectJson: projectJson() });

    const result = await runCommandInProcess(configCommand, ["enable-infra", "monitoring"], root);

    expect(result.status).toBeUndefined();
    expect(result.stdout).toContain("✓ Enabled: monitoring");
    expect(result.stdout).toMatch(/regenerate/i);
    expect(readProjectJson(root).optional_infra.monitoring).toBe(true);
  });

  it("disables a service that was enabled", async () => {
    const root = createTempProject({
      projectJson: projectJson("config-boundaries", { elk: true }),
    });

    const result = await runCommandInProcess(configCommand, ["disable-infra", "elk"], root);

    expect(result.status).toBeUndefined();
    expect(result.stdout).toContain("✓ Disabled: elk");
    expect(readProjectJson(root).optional_infra.elk).toBe(false);
  });

  it("rejects an unknown service name before reading the project", async () => {
    const root = createTempProject({ projectJson: projectJson() });
    const before = fs.readFileSync(path.join(root, ".flisk", "project.json"));

    const result = await runCommandInProcess(configCommand, ["enable-infra", "kafka"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Invalid service. Must be one of: monitoring, elk, debezium, golden_image, verdaccio",
    );
    expect(fs.readFileSync(path.join(root, ".flisk", "project.json"))).toEqual(before);
  });

  it("refuses to enable verdaccio without a license and leaves project.json unchanged", async () => {
    vi.stubEnv("FLISK_LICENSE_KEY", "");
    const root = createTempProject({ projectJson: projectJson() });
    const before = fs.readFileSync(path.join(root, ".flisk", "project.json"));

    const result = await runCommandInProcess(configCommand, ["enable-infra", "verdaccio"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Verdaccio is a Premium feature");
    expect(fs.readFileSync(path.join(root, ".flisk", "project.json"))).toEqual(before);
  });

  it("lets verdaccio be disabled without a license", async () => {
    vi.stubEnv("FLISK_LICENSE_KEY", "");
    const root = createTempProject({
      projectJson: projectJson("config-boundaries", { verdaccio: true }),
    });

    const result = await runCommandInProcess(configCommand, ["disable-infra", "verdaccio"], root);

    expect(result.status).toBeUndefined();
    expect(readProjectJson(root).optional_infra.verdaccio).toBe(false);
  });

  it("exits 1 with the project-root error outside a project", async () => {
    const root = createTempProject({ projectJson: null });

    const result = await runCommandInProcess(configCommand, ["enable-infra", "monitoring"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Could not find project root");
  });
});

describe("config version gate", () => {
  const pinnedFliskVersion = "999.999.999";

  const commands = [
    { name: "regenerate", args: ["regenerate"], status: undefined },
    { name: "migrate", args: ["migrate"], status: undefined },
    { name: "verify", args: ["verify"], status: 1 },
    { name: "enable-infra", args: ["enable-infra", "monitoring"], status: undefined },
    { name: "disable-infra", args: ["disable-infra", "monitoring"], status: undefined },
  ];

  it.each(commands)(
    "rejects $name when the CLI does not match pinnedFliskVersion",
    async ({ args }) => {
      const root = createTempProject({
        projectJson: {
          ...projectJson(),
          pinnedFliskVersion,
        },
        resources: {
          "shop/api": {
            type: "api",
            stack: "core",
          },
        },
      });

      const result = await runCommandInProcess(configCommand, args, root);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`does not match pinnedFliskVersion ${pinnedFliskVersion}`);
      expect(result.stderr).toContain(`npm install -g @flisk-sh/flisk@${pinnedFliskVersion}`);
    },
  );

  it.each(commands)("allows $name to continue with --ignore-version", async ({ args, status }) => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    const root = createTempProject({
      projectJson: {
        ...projectJson(),
        pinnedFliskVersion,
      },
    });

    const result = await runCommandInProcess(configCommand, [...args, "--ignore-version"], root);
    expect(result.status).toBe(status);

    expect(warning).toHaveBeenCalledWith(expect.stringContaining("--ignore-version set"));

    expect(result.stderr).not.toContain(`does not match pinnedFliskVersion ${pinnedFliskVersion}`);

    expect(result.stdout.trim()).not.toBe("");
  });

  it("does not generate files when regenerate is blocked by the version gate", async () => {
    const root = createTempProject({
      projectJson: {
        ...projectJson(),
        pinnedFliskVersion,
      },
    });

    const result = await runCommandInProcess(configCommand, ["regenerate"], root);

    expect(result.status).toBe(1);
    expect(fs.existsSync(path.join(root, ".flisk", ".flisk-out", "spec.master"))).toBe(false);
  });

  it("does not migrate service.json when migrate is blocked by the version gate", async () => {
    const root = createTempProject({
      projectJson: {
        ...projectJson(),
        pinnedFliskVersion,
      },
      resources: {
        "shop/api": {
          type: "api",
          stack: "core",
        },
      },
    });

    const file = serviceFile(root, "shop/api");
    const before = fs.readFileSync(file);

    const result = await runCommandInProcess(configCommand, ["migrate"], root);

    expect(result.status).toBe(1);
    expect(fs.readFileSync(file)).toEqual(before);
  });

  it.each([
    {
      name: "enable-infra",
      args: ["enable-infra", "monitoring"],
      optionalInfra: { monitoring: false },
    },
    {
      name: "disable-infra",
      args: ["disable-infra", "monitoring"],
      optionalInfra: { monitoring: true },
    },
  ])(
    "does not modify project.json when $name is blocked by the version gate",
    async ({ args, optionalInfra }) => {
      const root = createTempProject({
        projectJson: {
          ...projectJson("config-version-gate", optionalInfra),
          pinnedFliskVersion,
        },
      });

      const file = path.join(root, ".flisk", "project.json");
      const before = fs.readFileSync(file);

      const result = await runCommandInProcess(configCommand, args, root);

      expect(result.status).toBe(1);
      expect(fs.readFileSync(file)).toEqual(before);
    },
  );

  it.each([
    { name: "regenerate", args: ["regenerate", "--json"] },
    { name: "migrate", args: ["migrate", "--json"] },
    { name: "verify", args: ["verify", "--json"] },
    {
      name: "enable-infra",
      args: ["enable-infra", "monitoring", "--json"],
    },
    {
      name: "disable-infra",
      args: ["disable-infra", "monitoring", "--json"],
    },
  ])(
    "emits a valid JSON error envelope when $name is blocked by the version gate",
    async ({ args }) => {
      const root = createTempProject({
        projectJson: {
          ...projectJson(),
          pinnedFliskVersion,
        },
      });

      const result = await runCommandInProcess(configCommand, args, root);

      expect(result.status).toBe(1);

      expect(parseEnvelope(result.stdout)).toMatchObject({
        schemaVersion: 1,
        data: null,
        errors: [
          {
            message: expect.stringContaining(
              `does not match pinnedFliskVersion ${pinnedFliskVersion}`,
            ),
          },
        ],
      });
    },
  );

  it.each([
    {
      name: "enable-infra",
      args: ["enable-infra", "monitoring"],
      optionalInfra: { monitoring: false },
      expectedEnabled: true,
    },
    {
      name: "disable-infra",
      args: ["disable-infra", "monitoring"],
      optionalInfra: { monitoring: true },
      expectedEnabled: false,
    },
  ])(
    "preserves version requirements when $name updates project.json",
    async ({ args, optionalInfra, expectedEnabled }) => {
      const root = createTempProject({
        projectJson: {
          ...projectJson("config-version-preservation", optionalInfra),
          minFliskVersion: "1.3.70",
          pinnedFliskVersion: "1.3.80",
        },
      });

      const result = await runCommandInProcess(configCommand, [...args, "--ignore-version"], root);

      expect(result.status).toBeUndefined();

      const saved = JSON.parse(fs.readFileSync(path.join(root, ".flisk", "project.json"), "utf-8"));

      expect(saved.minFliskVersion).toBe("1.3.70");
      expect(saved.pinnedFliskVersion).toBe("1.3.80");
      expect(saved.optional_infra.monitoring).toBe(expectedEnabled);
    },
  );
});

describe("config edit", () => {
  let stdinTty: PropertyDescriptor | undefined;
  let stdoutTty: PropertyDescriptor | undefined;

  beforeEach(() => {
    stdinTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    stdoutTty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
  });

  afterEach(() => {
    if (stdinTty) Object.defineProperty(process.stdin, "isTTY", stdinTty);
    else delete (process.stdin as { isTTY?: boolean }).isTTY;
    if (stdoutTty) Object.defineProperty(process.stdout, "isTTY", stdoutTty);
    else delete (process.stdout as { isTTY?: boolean }).isTTY;
  });

  it("opens project.json in a known editor with its own arguments", async () => {
    vi.stubEnv("EDITOR", "code --wait");
    const root = createTempProject({ projectJson: projectJson() });

    const result = await runCommandInProcess(configCommand, ["edit"], root);

    expect(result.status).toBeUndefined();
    expect(spawnSync).toHaveBeenCalledWith(
      "code",
      ["--wait", path.join(root, ".flisk", "project.json")],
      { stdio: "inherit" },
    );
    expect(result.stdout).toContain("Editor closed.");
  });

  it("prefers $VISUAL over $EDITOR", async () => {
    vi.stubEnv("VISUAL", "nano");
    vi.stubEnv("EDITOR", "code --wait");
    const root = createTempProject({ projectJson: projectJson() });

    const result = await runCommandInProcess(configCommand, ["edit"], root);

    expect(result.status).toBeUndefined();
    expect(spawnSync).toHaveBeenCalledWith("nano", [path.join(root, ".flisk", "project.json")], {
      stdio: "inherit",
    });
  });

  it("keeps an editor that is not on the old allow-list", async () => {
    vi.stubEnv("EDITOR", "cursor --wait");
    const root = createTempProject({ projectJson: projectJson() });

    const result = await runCommandInProcess(configCommand, ["edit"], root);

    expect(result.status).toBeUndefined();
    expect(result.stderr).not.toContain("Unknown editor");
    expect(spawnSync).toHaveBeenCalledWith(
      "cursor",
      ["--wait", path.join(root, ".flisk", "project.json")],
      { stdio: "inherit" },
    );
  });

  it("fails fast without a terminal and never starts an editor", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    const root = createTempProject({ projectJson: projectJson() });

    const result = await runCommandInProcess(configCommand, ["edit"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "config edit needs a terminal; edit .flisk/project.json directly",
    );
    expect(result.stderr).toContain("flisk config regenerate");
    expect(result.stdout).not.toContain("Opening");
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("fails fast when stdout is not a terminal and never starts an editor", async () => {
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
    const root = createTempProject({ projectJson: projectJson() });

    const result = await runCommandInProcess(configCommand, ["edit"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "config edit needs a terminal; edit .flisk/project.json directly",
    );
    expect(result.stdout).not.toContain("Opening");
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("reports an editor's non-zero exit without claiming success", async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({ status: 1 } as ReturnType<typeof spawnSync>);
    const root = createTempProject({ projectJson: projectJson() });

    const result = await runCommandInProcess(configCommand, ["edit"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Editor "vi" failed');
    expect(result.stderr).toContain("Exited with status 1");
    expect(result.stdout).not.toContain("Editor closed.");
  });

  it("reports an editor that cannot be launched without claiming success", async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: null,
      error: Object.assign(new Error("spawn missing-editor ENOENT"), { code: "ENOENT" }),
    } as unknown as ReturnType<typeof spawnSync>);
    const root = createTempProject({ projectJson: projectJson() });

    const result = await runCommandInProcess(configCommand, ["edit"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Editor "vi" failed');
    expect(result.stderr).toContain("ENOENT");
    expect(result.stdout).not.toContain("Editor closed.");
  });

  it("reports an editor terminated by a signal without claiming success", async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: null,
      signal: "SIGTERM",
    } as ReturnType<typeof spawnSync>);
    const root = createTempProject({ projectJson: projectJson() });

    const result = await runCommandInProcess(configCommand, ["edit"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Editor "vi" failed');
    expect(result.stderr).toContain("Terminated by SIGTERM");
    expect(result.stdout).not.toContain("Editor closed.");
  });

  it("rejects malformed project.json after the editor exits successfully", async () => {
    const root = createTempProject({ projectJson: projectJson() });
    vi.mocked(spawnSync).mockImplementationOnce(() => {
      fs.writeFileSync(path.join(root, ".flisk", "project.json"), "{ invalid\n");
      return { status: 0 } as ReturnType<typeof spawnSync>;
    });

    const result = await runCommandInProcess(configCommand, ["edit"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Editor saved an invalid .flisk/project.json");
    expect(result.stderr).toContain("Fix .flisk/project.json");
    expect(result.stderr).toContain("Could not parse project.json");
    expect(result.stdout).not.toContain("Editor closed.");
  });

  it("exits 1 when project.json is missing without launching an editor", async () => {
    const root = createTempProject({ projectJson: null });
    vi.mocked(findProjectRoot).mockReturnValueOnce(root);

    const result = await runCommandInProcess(configCommand, ["edit"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(".flisk/project.json not found");
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("exits 1 outside a project without launching an editor", async () => {
    const root = createTempProject({ projectJson: null });

    const result = await runCommandInProcess(configCommand, ["edit"], root);

    expect(result.status).toBe(1);
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
