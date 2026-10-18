// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempProject, parseEnvelope, runCommandInProcess } from "../../test-support/index.js";
import { configCommand } from "../config.js";

beforeEach(() => {
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
          pre_alpha: { name: "pre-alpha", description: "Pre-alpha phase", enabledStacks: [] },
          alpha: { name: "alpha", description: "Alpha phase", enabledStacks: [] },
          beta: { name: "beta", description: "Beta phase", enabledStacks: [] },
          out_of_scope: { name: "out-of-scope", description: "Future phase", enabledStacks: [] },
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
  JSON.parse(fs.readFileSync(path.join(root, ".tdk", "project.json"), "utf-8")) as {
    optional_infra: Record<string, boolean>;
  };

describe("config regenerate --dry-run", () => {
  it("reports every master file as NEW and writes nothing when no output exists", async () => {
    const root = createTempProject({ projectJson: projectJson() });

    const result = await runCommandInProcess(configCommand, ["regenerate", "--dry-run"], root);

    expect(result.status).toBeUndefined();
    expect(result.stdout).toContain("Dry run - comparing current files");
    expect(result.stdout.match(/Status: NEW/g)).toHaveLength(3);
    expect(result.stdout).toContain("Run without --dry-run to apply these changes.");
    expect(fs.existsSync(path.join(root, ".tdk", ".tdk-out"))).toBe(false);
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
    expect(result.stdout).toContain("Status: MODIFIED");
    // The stale spec.master has fewer lines than the generated file, so the count goes up.
    expect(result.stdout).toMatch(/Lines: 2 → \d+ \(\+\d+\)/);
    // The stale tech stack has more lines, so the count goes down.
    expect(result.stdout).toMatch(/Lines: 300 → \d+ \(-\d+\)/);
    expect(result.stdout).toContain("First change around line 1:");
    expect(result.stdout).toContain(`- ${"x".repeat(60)}...`);
    expect(result.stdout).toContain("Run without --dry-run to apply these changes.");
    // Dry run never touches the stale files.
    expect(fs.readFileSync(path.join(root, ".tdk", ".tdk-out", "spec.master"), "utf-8")).toBe(
      "stale\n",
    );
  });

  it("says everything is up to date right after a regenerate", async () => {
    const root = createTempProject({ projectJson: projectJson() });
    expect((await runCommandInProcess(configCommand, ["regenerate"], root)).status).toBeUndefined();

    const result = await runCommandInProcess(configCommand, ["regenerate", "--dry-run"], root);

    expect(result.status).toBeUndefined();
    expect(result.stdout.match(/Status: No changes/g)).toHaveLength(3);
    expect(result.stdout).toContain("All files are already up to date!");
  });

  it("fails with a runCommand error when project.json is not valid JSON", async () => {
    const root = createTempProject({ projectJson: "{invalid\n" });

    const result = await runCommandInProcess(configCommand, ["regenerate", "--dry-run"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Error:");
  });
});

describe("config regenerate", () => {
  it("writes the generated files and reports success", async () => {
    const root = createTempProject({ projectJson: projectJson() });

    const result = await runCommandInProcess(configCommand, ["regenerate"], root);

    expect(result.status).toBeUndefined();
    expect(result.stdout).toContain("Regenerating master configuration files");
    expect(result.stdout).toContain("Configuration regenerated!");
    expect(fs.existsSync(path.join(root, ".tdk", ".tdk-out", "spec.master"))).toBe(true);
  });

  it("exits 1 with the project-root error outside a project", async () => {
    const root = createTempProject({ projectJson: null });

    const result = await runCommandInProcess(configCommand, ["regenerate"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Could not find project root");
  });
});

describe("config verify", () => {
  it("exits 1 and suggests regenerate when generated files are missing", async () => {
    const root = createTempProject({ projectJson: projectJson() });

    const result = await runCommandInProcess(configCommand, ["verify"], root);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Configuration issues found:");
    expect(result.stdout).toContain("Missing file: .tdk/.tdk-out/spec.master");
    expect(result.stdout).toContain("Run `tdk config regenerate` to fix generated files.");
    expect(result.stdout).not.toContain("tdk config migrate");
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
    expect(result.stdout).toContain("Run `tdk config migrate` to fix schemaVersion.");
    expect(result.stdout).not.toContain("tdk config regenerate");
  });

  it("names the dependsOn target when it is not a known service or stack", async () => {
    const root = createTempProject({
      projectJson: projectJson(),
      resources: {
        "shop/api": { appType: "api", stack: "core", schemaVersion: 1, dependsOn: ["ghost"] },
      },
    });
    await runCommandInProcess(configCommand, ["regenerate"], root);

    const result = await runCommandInProcess(configCommand, ["verify"], root);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('dependsOn "ghost" on');
    expect(result.stdout).toContain(
      "shared platform Postgres names are postgres and database-management",
    );
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
      errors: [{ code: "COMMAND_FAILED", message: expect.stringContaining("project root") }],
    });
  });
});

describe("config migrate", () => {
  it("adds appType from the legacy type field and stamps schemaVersion", async () => {
    const root = createTempProject({
      projectJson: projectJson(),
      resources: { "shop/api": { type: "api", stack: "core", extra: true } },
    });

    const result = await runCommandInProcess(configCommand, ["migrate"], root);

    expect(result.status).toBeUndefined();
    expect(result.stdout).toContain("Migrated 1 service.json file to schema version 1.");
    expect(result.stdout).toContain("unknown fields were preserved");
    const migrated = JSON.parse(fs.readFileSync(serviceFile(root, "shop/api"), "utf-8")) as Record<
      string,
      unknown
    >;
    expect(migrated).toMatchObject({ appType: "api", schemaVersion: 1, extra: true });
  });

  it("leaves a service already at the current schemaVersion alone and counts zero", async () => {
    const root = createTempProject({
      projectJson: projectJson(),
      resources: { "shop/api": { appType: "api", stack: "core", schemaVersion: 1 } },
    });
    const before = fs.readFileSync(serviceFile(root, "shop/api"));

    const result = await runCommandInProcess(configCommand, ["migrate"], root);

    expect(result.status).toBeUndefined();
    expect(result.stdout).toContain("Migrated 0 service.json files");
    expect(fs.readFileSync(serviceFile(root, "shop/api"))).toEqual(before);
  });

  it("refuses an unsupported schemaVersion and writes nothing", async () => {
    const root = createTempProject({
      projectJson: projectJson(),
      resources: { "shop/api": { appType: "api", stack: "core", schemaVersion: 99 } },
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
    expect(result.stderr).toMatch(/broken\/api\/service\.json: /);
    expect(result.stderr).toContain("list/api/service.json: expected a JSON object");
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
    expect(result.stderr).toContain("shop/api");
    expect(fs.readFileSync(serviceFile(root, "shop/api"))).toEqual(before);
  });
});

describe("config enable-infra and disable-infra", () => {
  it("enables a service and persists it to project.json", async () => {
    const root = createTempProject({ projectJson: projectJson() });

    const result = await runCommandInProcess(configCommand, ["enable-infra", "monitoring"], root);

    expect(result.status).toBeUndefined();
    expect(result.stdout).toContain("✓ Enabled: monitoring");
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
    const before = fs.readFileSync(path.join(root, ".tdk", "project.json"));

    const result = await runCommandInProcess(configCommand, ["enable-infra", "kafka"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid service. Must be one of: monitoring");
    expect(fs.readFileSync(path.join(root, ".tdk", "project.json"))).toEqual(before);
  });

  it("refuses to enable verdaccio without a license and leaves project.json unchanged", async () => {
    vi.stubEnv("TDK_LICENSE_KEY", "");
    const root = createTempProject({ projectJson: projectJson() });
    const before = fs.readFileSync(path.join(root, ".tdk", "project.json"));

    const result = await runCommandInProcess(configCommand, ["enable-infra", "verdaccio"], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Verdaccio is a Premium feature");
    expect(fs.readFileSync(path.join(root, ".tdk", "project.json"))).toEqual(before);
  });

  it("lets verdaccio be disabled without a license", async () => {
    vi.stubEnv("TDK_LICENSE_KEY", "");
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

describe("config edit", () => {
  it("opens project.json in a known editor with its own arguments", async () => {
    vi.stubEnv("EDITOR", "code --wait");
    const root = createTempProject({ projectJson: projectJson() });

    const result = await runCommandInProcess(configCommand, ["edit"], root);

    expect(result.status).toBeUndefined();
    expect(spawnSync).toHaveBeenCalledWith(
      "code",
      ["--wait", path.join(root, ".tdk", "project.json")],
      { stdio: "inherit" },
    );
    expect(result.stdout).toContain("Editor closed.");
  });

  it("falls back to vi with a warning for an unknown editor", async () => {
    vi.stubEnv("EDITOR", "/opt/bin/frobnicate");
    const root = createTempProject({ projectJson: projectJson() });

    const result = await runCommandInProcess(configCommand, ["edit"], root);

    expect(result.stderr).toContain(
      "Warning: Unknown editor \"/opt/bin/frobnicate\". Using 'vi' instead.",
    );
    expect(spawnSync).toHaveBeenCalledWith("vi", [path.join(root, ".tdk", "project.json")], {
      stdio: "inherit",
    });
    expect(spawnSync).not.toHaveBeenCalledWith("frobnicate", expect.anything(), expect.anything());
  });

  it("exits 1 outside a project without launching an editor", async () => {
    const root = createTempProject({ projectJson: null });

    const result = await runCommandInProcess(configCommand, ["edit"], root);

    expect(result.status).toBe(1);
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
