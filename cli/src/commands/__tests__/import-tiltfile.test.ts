// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCommandInProcess } from "../../test-support/index.js";
import type { ProjectConfig } from "../../types/index.js";
import { importCommand, importTiltfile } from "../import.js";

const tiltfileCommand = importCommand.commands.find((c) => c.name() === "tiltfile")!;

function resetCommandOptions(): void {
  for (const name of ["force", "dryRun", "json", "yes"]) {
    importCommand.setOptionValue(name, false);
    tiltfileCommand.setOptionValue(name, false);
  }
}

describe("flisk import tiltfile", () => {
  describe("command registration and options", () => {
    it("is registered as a subcommand of import with the expected options", () => {
      expect(tiltfileCommand.name()).toBe("tiltfile");
      const forceOpt = tiltfileCommand.options.find((o) => o.long === "--force");
      expect(forceOpt).toBeDefined();
      expect(forceOpt?.short).toBe("-f");
      const dryRunOpt = tiltfileCommand.options.find((o) => o.long === "--dry-run");
      expect(dryRunOpt).toBeDefined();
      const jsonOpt = tiltfileCommand.options.find((o) => o.long === "--json");
      expect(jsonOpt).toBeDefined();
    });
  });

  describe("missing file rejection", () => {
    it("rejects when no Tiltfile exists in current directory", async () => {
      resetCommandOptions();
      const dir = createTempDir("import-tiltfile-missing-");
      const result = await runCommandInProcess(importCommand, ["tiltfile"], dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Tiltfile not found");
      expect(existsSync(join(dir, ".flisk"))).toBe(false);
    });

    it("rejects when specified Tiltfile path does not exist", async () => {
      resetCommandOptions();
      const dir = createTempDir("import-tiltfile-missing-path-");
      const result = await runCommandInProcess(
        importCommand,
        ["tiltfile", "custom/missing.Tiltfile"],
        dir,
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Tiltfile not found at custom/missing.Tiltfile");
      expect(existsSync(join(dir, ".flisk"))).toBe(false);
    });

    it("prints an IMPORT_FAILED JSON envelope when missing Tiltfile is imported with --json", async () => {
      resetCommandOptions();
      const dir = createTempDir("import-tiltfile-missing-json-");
      const result = await runCommandInProcess(importCommand, ["tiltfile", "--json"], dir);
      expect(result.status).toBe(1);
      const envelope = JSON.parse(result.stdout);
      expect(envelope).toEqual({
        schemaVersion: 1,
        data: null,
        errors: [
          expect.objectContaining({
            code: "IMPORT_FAILED",
            message: expect.stringContaining("Tiltfile not found"),
          }),
        ],
      });
    });

    it("rejects programmatically via importTiltfile with JsonCommandError", async () => {
      const dir = createTempDir("import-tiltfile-throw-");
      await expect(importTiltfile("nonexistent", { cwd: dir })).rejects.toMatchObject({
        code: "IMPORT_FAILED",
        message: expect.stringContaining("Tiltfile not found at nonexistent"),
      });
    });
  });

  describe("successful wrap and import", () => {
    it("creates .flisk/project.json and registers Tiltfile when none existed", async () => {
      resetCommandOptions();
      const dir = createTempDir("import-tiltfile-create-");
      const tiltfileContent = "# Existing user Tiltfile\nprint('hello tilt')\n";
      writeFileSync(join(dir, "Tiltfile"), tiltfileContent);

      const result = await runCommandInProcess(importCommand, ["tiltfile"], dir);
      expect(result.status).toBeUndefined();
      expect(result.stdout).toContain("Registered Tiltfile as orchestration source");

      // Verifies .flisk/project.json was created with tiltfile source
      const projectJsonPath = join(dir, ".flisk", "project.json");
      expect(existsSync(projectJsonPath)).toBe(true);
      const config = JSON.parse(readFileSync(projectJsonPath, "utf-8")) as ProjectConfig;
      expect(config.orchestration).toEqual({
        source: "tiltfile",
        path: "Tiltfile",
      });

      // Verifies the user Tiltfile was preserved and untouched
      expect(readFileSync(join(dir, "Tiltfile"), "utf-8")).toBe(tiltfileContent);

      // Verifies no generated Tiltfile was placed in .flisk
      expect(existsSync(join(dir, ".flisk", ".flisk-out", "Tiltfile"))).toBe(false);
    });

    it("updates existing .flisk/project.json by recording orchestration source", async () => {
      resetCommandOptions();
      const dir = createTempDir("import-tiltfile-update-");
      const tiltfileContent = "# Another Tiltfile\n";
      writeFileSync(join(dir, "Tiltfile"), tiltfileContent);

      mkdirSync(join(dir, ".flisk"), { recursive: true });
      const initialConfig: ProjectConfig = {
        version: "1.0",
        project: {
          name: "my-existing-app",
          version: "2.3.4",
        },
        phases: {
          pre_alpha: { name: "Pre-Alpha", description: "Core", enabledStacks: ["core"] },
          alpha: { name: "Alpha", description: "Alpha", enabledStacks: [] },
          beta: { name: "Beta", description: "Beta", enabledStacks: [] },
          out_of_scope: { name: "Out of Scope", description: "Future", enabledStacks: [] },
        },
        optional_infra: {
          monitoring: false,
          elk: false,
          debezium: false,
          golden_image: true,
          verdaccio: false,
        },
        discovery: {
          paths: ["services/*/*"],
        },
      };
      writeFileSync(join(dir, ".flisk", "project.json"), JSON.stringify(initialConfig, null, 2));

      const result = await runCommandInProcess(importCommand, ["tiltfile"], dir);
      expect(result.status).toBeUndefined();

      const updated = JSON.parse(
        readFileSync(join(dir, ".flisk", "project.json"), "utf-8"),
      ) as ProjectConfig;
      expect(updated.project.name).toBe("my-existing-app");
      expect(updated.project.version).toBe("2.3.4");
      expect(updated.orchestration).toEqual({
        source: "tiltfile",
        path: "Tiltfile",
      });
    });

    it("registers a custom Tiltfile path relative to the project root", async () => {
      resetCommandOptions();
      const dir = createTempDir("import-tiltfile-custom-");
      mkdirSync(join(dir, "infra"), { recursive: true });
      writeFileSync(join(dir, "infra", "Tiltfile"), "# Infra Tiltfile\n");

      const result = await runCommandInProcess(importCommand, ["tiltfile", "infra/Tiltfile"], dir);
      expect(result.status).toBeUndefined();

      const config = JSON.parse(
        readFileSync(join(dir, ".flisk", "project.json"), "utf-8"),
      ) as ProjectConfig;
      expect(config.orchestration).toEqual({
        source: "tiltfile",
        path: "infra/Tiltfile",
      });
    });
  });

  describe("dry-run mode", () => {
    it("reports plan without creating .flisk/project.json", async () => {
      resetCommandOptions();
      const dir = createTempDir("import-tiltfile-dryrun-");
      writeFileSync(join(dir, "Tiltfile"), "# Dry run target\n");

      const result = await runCommandInProcess(importCommand, ["tiltfile", "--dry-run"], dir);
      expect(result.status).toBeUndefined();
      expect(result.stdout).toContain("[dry-run] Would register Tiltfile as orchestration source");
      expect(existsSync(join(dir, ".flisk", "project.json"))).toBe(false);
    });

    it("reports plan without modifying an existing .flisk/project.json", async () => {
      resetCommandOptions();
      const dir = createTempDir("import-tiltfile-dryrun-existing-");
      writeFileSync(join(dir, "Tiltfile"), "# Dry run target\n");

      mkdirSync(join(dir, ".flisk"), { recursive: true });
      const initial = JSON.stringify({
        version: "1.0",
        project: { name: "test", version: "1.0.0" },
      });
      writeFileSync(join(dir, ".flisk", "project.json"), initial);

      const result = await runCommandInProcess(importCommand, ["tiltfile", "--dry-run"], dir);
      expect(result.status).toBeUndefined();
      expect(readFileSync(join(dir, ".flisk", "project.json"), "utf-8")).toBe(initial);
    });
  });

  describe("json reporting", () => {
    it("reports full machine envelope on successful import", async () => {
      resetCommandOptions();
      const dir = createTempDir("import-tiltfile-json-");
      writeFileSync(join(dir, "Tiltfile"), "# JSON test\n");

      const result = await runCommandInProcess(importCommand, ["tiltfile", "--json"], dir);
      expect(result.status).toBeUndefined();
      const envelope = JSON.parse(result.stdout);
      expect(envelope).toEqual({
        schemaVersion: 1,
        data: {
          tiltfile: "Tiltfile",
          projectRoot: dir,
          projectJson: join(dir, ".flisk", "project.json"),
          orchestration: {
            source: "tiltfile",
            path: "Tiltfile",
          },
          dryRun: false,
          force: false,
          action: "created",
          written: [".flisk/project.json"],
        },
        errors: [],
      });
    });

    it("reports dry-run status in machine envelope with written empty", async () => {
      resetCommandOptions();
      const dir = createTempDir("import-tiltfile-json-dryrun-");
      writeFileSync(join(dir, "Tiltfile"), "# JSON dry run test\n");

      const result = await runCommandInProcess(
        importCommand,
        ["tiltfile", "--dry-run", "--json"],
        dir,
      );
      expect(result.status).toBeUndefined();
      const envelope = JSON.parse(result.stdout);
      expect(envelope).toEqual({
        schemaVersion: 1,
        data: {
          tiltfile: "Tiltfile",
          projectRoot: dir,
          projectJson: join(dir, ".flisk", "project.json"),
          orchestration: {
            source: "tiltfile",
            path: "Tiltfile",
          },
          dryRun: true,
          force: false,
          action: "created",
          written: [],
        },
        errors: [],
      });
      expect(existsSync(join(dir, ".flisk", "project.json"))).toBe(false);
    });
  });

  describe("force option behavior", () => {
    it("rejects overwriting existing orchestration without --force", async () => {
      resetCommandOptions();
      const dir = createTempDir("import-tiltfile-force-reject-");
      writeFileSync(join(dir, "Tiltfile"), "# New Tiltfile\n");

      mkdirSync(join(dir, ".flisk"), { recursive: true });
      const initialConfig = {
        version: "1.0",
        project: { name: "test", version: "1.0.0" },
        orchestration: {
          source: "tiltfile",
          path: "legacy/Tiltfile",
        },
      };
      writeFileSync(join(dir, ".flisk", "project.json"), JSON.stringify(initialConfig, null, 2));

      const result = await runCommandInProcess(importCommand, ["tiltfile"], dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Orchestration source is already configured");
      expect(result.stderr).toContain("Pass --force");

      // Configuration remains unchanged
      const config = JSON.parse(readFileSync(join(dir, ".flisk", "project.json"), "utf-8"));
      expect(config.orchestration.path).toBe("legacy/Tiltfile");
    });

    it("overwrites existing orchestration when --force is passed", async () => {
      resetCommandOptions();
      const dir = createTempDir("import-tiltfile-force-accept-");
      writeFileSync(join(dir, "Tiltfile"), "# Overwritten Tiltfile\n");

      mkdirSync(join(dir, ".flisk"), { recursive: true });
      const initialConfig = {
        version: "1.0",
        project: { name: "test", version: "1.0.0" },
        orchestration: {
          source: "docker-compose",
          path: "docker-compose.yml",
        },
      };
      writeFileSync(join(dir, ".flisk", "project.json"), JSON.stringify(initialConfig, null, 2));

      const result = await runCommandInProcess(importCommand, ["tiltfile", "--force"], dir);
      expect(result.status).toBeUndefined();

      const config = JSON.parse(readFileSync(join(dir, ".flisk", "project.json"), "utf-8"));
      expect(config.orchestration).toEqual({
        source: "tiltfile",
        path: "Tiltfile",
      });
    });
  });
});
