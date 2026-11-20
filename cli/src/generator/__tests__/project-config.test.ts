// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { ProjectConfig } from "../../types/index.js";
import { FliskError } from "../../utils/errors.js";
import {
  isTiltfileOrchestration,
  normalizeProjectConfig,
  ProjectConfigNotFoundError,
  readProjectConfig,
} from "../project-config.js";

// Complete ProjectConfig for the cases below; each test states only what it changes.
function projectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    version: "1.0",
    project: { name: "test-project", version: "1.0.0" },
    phases: {
      pre_alpha: { name: "Pre-Alpha", description: "", enabledStacks: [] },
      alpha: { name: "Alpha", description: "", enabledStacks: [] },
      beta: { name: "Beta", description: "", enabledStacks: [] },
      out_of_scope: { name: "Out of Scope", description: "", enabledStacks: [] },
    },
    optional_infra: {
      monitoring: false,
      elk: false,
      debezium: false,
      golden_image: false,
      verdaccio: false,
    },
    discovery: { paths: ["services/*/*"] },
    ...overrides,
  };
}

function writeProjectJson(projectRoot: string, config: unknown): void {
  fs.mkdirSync(path.join(projectRoot, ".flisk"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, ".flisk", "project.json"), JSON.stringify(config));
}

function withTempRoot<T>(fn: (projectRoot: string) => T): T {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-project-config-"));
  try {
    return fn(projectRoot);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

describe("project-config", () => {
  describe("readProjectConfig", () => {
    it("returns every field of a valid config, including the optional ones", () => {
      withTempRoot((projectRoot) => {
        const config = projectConfig({
          always_enabled_infra: ["traefik"],
          overrides: { "shop/api": { port: 4100 } },
        } as Partial<ProjectConfig>);
        writeProjectJson(projectRoot, config);

        expect(readProjectConfig(projectRoot)).toEqual(config);
      });
    });

    it("throws ProjectConfigNotFoundError when the project has no .flisk directory", () => {
      withTempRoot((projectRoot) => {
        let caught: unknown;
        try {
          readProjectConfig(projectRoot);
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(ProjectConfigNotFoundError);
        expect((caught as Error).message).toBe(
          `Project config not found: ${path.join(projectRoot, ".flisk", "project.json")}. Run 'flisk project --yes' first.`,
        );
      });
    });

    it("throws a plain Error naming the file when project.json is malformed", () => {
      withTempRoot((projectRoot) => {
        const fliskDir = path.join(projectRoot, ".flisk");
        fs.mkdirSync(fliskDir, { recursive: true });
        const projectJsonPath = path.join(fliskDir, "project.json");
        fs.writeFileSync(projectJsonPath, '{ "version": "1.0", broken json ', "utf-8");

        let caught: unknown;
        try {
          readProjectConfig(projectRoot);
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(Error);
        expect(caught).not.toBeInstanceOf(ProjectConfigNotFoundError);
        expect((caught as Error).message).toContain(
          `Could not parse project.json at ${projectJsonPath}:`,
        );
      });
    });

    it("rejects a wrong-typed field with a FliskError naming the field", () => {
      withTempRoot((projectRoot) => {
        writeProjectJson(projectRoot, {
          ...projectConfig(),
          optional_infra: { ...projectConfig().optional_infra, verdaccio: "yes" },
        });

        let caught: unknown;
        try {
          readProjectConfig(projectRoot);
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(FliskError);
        expect((caught as Error).message).toContain(
          ".flisk/project.json.optional_infra.verdaccio: expected a boolean",
        );
        expect((caught as FliskError).exitCode).toBe(1);
        expect(caught).not.toBeInstanceOf(ProjectConfigNotFoundError);
      });
    });

    it("migrates a legacy stacks config to phases", () => {
      withTempRoot((projectRoot) => {
        writeProjectJson(projectRoot, {
          version: "1.0",
          project: { name: "legacy", version: "1.0.0" },
          stacks: {
            pre_alpha: { name: "Pre-Alpha", description: "d0", services: ["proxy"] },
            alpha: { name: "Alpha", description: "d1", services: ["database-management"] },
            beta: { name: "Beta", description: "d2", services: [] },
            out_of_scope: { name: "Out", description: "d3", services: ["verdaccio"] },
          },
          optional_infra: projectConfig().optional_infra,
          discovery: { paths: ["services/*/*"] },
          overrides: {},
        });

        const config = readProjectConfig(projectRoot);

        expect(config.phases.pre_alpha).toEqual({
          name: "Pre-Alpha",
          description: "d0",
          enabledStacks: ["proxy"],
        });
        expect(config.phases.out_of_scope.enabledStacks).toEqual(["verdaccio"]);
        expect(config.stacks).toBeUndefined();
      });
    });
  });

  describe("normalizeProjectConfig", () => {
    it("accepts a valid config and returns it unchanged", () => {
      const config = projectConfig();
      const normalized = normalizeProjectConfig(config);
      expect(normalized).toEqual({ ok: true, config });
    });

    it("reports the first wrong-typed field instead of throwing", () => {
      const normalized = normalizeProjectConfig({ version: 1 });
      expect(normalized.ok).toBe(false);
      if (!normalized.ok) {
        expect(normalized.problem.field).toBe("version");
        expect(normalized.problem.expected).toBe("a string");
      }
    });

    it("rejects a non-object value", () => {
      const normalized = normalizeProjectConfig("not an object");
      expect(normalized.ok).toBe(false);
      if (!normalized.ok) {
        expect(normalized.problem.field).toBe("");
      }
    });
  });

  describe("isTiltfileOrchestration", () => {
    it("is true when project.json selects its own Tiltfile", () => {
      withTempRoot((projectRoot) => {
        writeProjectJson(
          projectRoot,
          projectConfig({
            orchestration: { source: "tiltfile", path: "Tiltfile" },
          } as Partial<ProjectConfig>),
        );
        expect(isTiltfileOrchestration(projectRoot)).toBe(true);
      });
    });

    it("is false when project.json has no orchestration block", () => {
      withTempRoot((projectRoot) => {
        writeProjectJson(projectRoot, projectConfig());
        expect(isTiltfileOrchestration(projectRoot)).toBe(false);
      });
    });

    it("is false when there is no readable project.json", () => {
      withTempRoot((projectRoot) => {
        expect(isTiltfileOrchestration(projectRoot)).toBe(false);
      });
    });
  });
});
