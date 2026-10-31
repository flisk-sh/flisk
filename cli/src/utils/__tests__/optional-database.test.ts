// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_CAPABILITIES } from "../../config/platform-standards.js";
import {
  generateMasterConfigs,
  TemplateEngine,
  verifyMasterConfigs,
} from "../../generator/template-engine.js";
import { makeResource } from "../../test-support/index.js";
import type { DiscoveredResource, DiscoveredStack, ProjectConfig } from "../../types/index.js";
import {
  disableDatabaseCapability,
  getEnabledCapabilities,
  isDatabaseCapabilityEnabled,
  resolveProjectCapabilities,
} from "../capabilities.js";
import { createDoctorReport } from "../doctor-report.js";
import { checkHostPorts } from "../doctor-runtime.js";
import { checkPostgresCredentials, checkSharedPlatformPostgres } from "../doctor-wiring.js";
import { groupSharedPostgres } from "../shared-infra.js";
import {
  databaseManagementEnabled,
  evaluateSharedPlatformPostgres,
} from "../shared-platform-postgres.js";

function makeStack(name: string, resources: DiscoveredResource[]): DiscoveredStack {
  return { name, resources, resourceCount: resources.length };
}

function makeProjectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    version: "1.0.0",
    project: {
      name: "test-project",
      version: "1.0.0",
    },
    phases: {
      pre_alpha: {
        name: "Pre-Alpha",
        description: "Core infrastructure",
        enabledStacks: ["database-management", "proxy"],
      },
      alpha: {
        name: "Alpha",
        description: "Alpha phase",
        enabledStacks: [],
      },
      beta: {
        name: "Beta",
        description: "Beta phase",
        enabledStacks: [],
      },
      out_of_scope: {
        name: "Out of Scope",
        description: "Out of scope",
        enabledStacks: [],
      },
    },
    optional_infra: {
      monitoring: false,
      elk: false,
      debezium: false,
      golden_image: false,
      verdaccio: false,
    },
    discovery: {
      paths: ["services/*"],
    },
    ...overrides,
  };
}

const noDocker = (() => "") as never;
const inUse =
  (ports: number[]) =>
  async (port: number): Promise<"free" | "in-use" | "unknown"> =>
    ports.includes(port) ? "in-use" : "free";

describe("Optional Database Capability", () => {
  describe("isDatabaseCapabilityEnabled and getEnabledCapabilities", () => {
    it("is enabled by default", () => {
      expect(isDatabaseCapabilityEnabled()).toBe(true);
      expect(isDatabaseCapabilityEnabled({})).toBe(true);
      // Every capability is on by default, the database among them.
      expect(getEnabledCapabilities({})).toEqual(Object.keys(DEFAULT_CAPABILITIES));
      expect(getEnabledCapabilities({})).toContain("database");
    });

    it("detects database disabled in top-level capabilities", () => {
      const config = { capabilities: { database: false } };
      expect(isDatabaseCapabilityEnabled(config)).toBe(false);
      // Only the database is off: the other capabilities, such as the gateway, stay on.
      expect(getEnabledCapabilities(config)).toEqual(
        Object.keys(DEFAULT_CAPABILITIES).filter((name) => name !== "database"),
      );
    });

    it("detects database disabled via CLI options", () => {
      expect(isDatabaseCapabilityEnabled(null, { database: false })).toBe(false);
      expect(isDatabaseCapabilityEnabled(null, { capabilities: { database: false } })).toBe(false);
      const enabled = getEnabledCapabilities(null, { database: false });
      expect(enabled).not.toContain("database");
    });

    it("reads capabilities from .flisk/project.json on disk", () => {
      const root = mkdtempSync(join(tmpdir(), "flisk-test-caps-"));
      try {
        mkdirSync(join(root, ".flisk"), { recursive: true });
        writeFileSync(
          join(root, ".flisk", "project.json"),
          JSON.stringify({
            version: "1.0.0",
            project: { name: "my-app", version: "1.0.0" },
            capabilities: { database: false },
          }),
        );
        expect(isDatabaseCapabilityEnabled(root)).toBe(false);
        const enabled = getEnabledCapabilities(root);
        expect(enabled).not.toContain("database");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("a flag left at its Commander default does not undo a project's opt-out", () => {
      // Commander sets database: true whenever --no-database is not given.
      const config = { capabilities: { database: false } };
      expect(isDatabaseCapabilityEnabled(config, { database: true })).toBe(false);
      expect(
        resolveProjectCapabilities(config, { capabilities: { database: true } }).database,
      ).toBe(false);
      expect(isDatabaseCapabilityEnabled({}, { database: true })).toBe(true);
    });
  });

  describe("Shared Infrastructure with database disabled", () => {
    it("groupSharedPostgres returns null when database capability is disabled", () => {
      const stacks = [
        makeStack("shop", [
          { ...makeResource("api", "backend", { dependsOn: ["postgres"] }), stack: "shop" },
        ]),
      ];
      // Enabled case returns postgres
      const enabled = groupSharedPostgres("demo", stacks);
      expect(enabled).not.toBeNull();
      expect(enabled?.name).toBe("postgres");

      // Disabled case returns null
      const disabled = groupSharedPostgres("demo", stacks, { database: false });
      expect(disabled).toBeNull();
    });

    it("databaseManagementEnabled returns false when database capability is disabled", () => {
      const root = mkdtempSync(join(tmpdir(), "flisk-test-db-enabled-"));
      try {
        mkdirSync(join(root, ".flisk"), { recursive: true });
        writeFileSync(
          join(root, ".flisk", "project.json"),
          JSON.stringify({
            version: "1.0.0",
            project: { name: "my-app", version: "1.0.0" },
            always_enabled_infra: ["database-management"],
            capabilities: { database: false },
          }),
        );
        expect(databaseManagementEnabled(root)).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("evaluateSharedPlatformPostgres reports willStart=false when database is disabled", () => {
      const root = mkdtempSync(join(tmpdir(), "flisk-test-eval-"));
      try {
        mkdirSync(join(root, ".flisk"), { recursive: true });
        writeFileSync(
          join(root, ".flisk", "project.json"),
          JSON.stringify({
            version: "1.0.0",
            project: { name: "my-app", version: "1.0.0" },
            always_enabled_infra: ["database-management"],
            capabilities: { database: false },
          }),
        );
        const evalResult = evaluateSharedPlatformPostgres(root, []);
        expect(evalResult.willStart).toBe(false);
        expect(evalResult.featureOn).toBe(false);
        expect(evalResult.reason).toBe("none");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  describe("Doctor and Preflight checks with database disabled", () => {
    it("skips port 5432 in checkHostPorts when database capability is disabled", async () => {
      // With database enabled and port 5432 in use, checkHostPorts fails
      const failingResult = await checkHostPorts(noDocker, "shop", inUse([5432]), {
        database: true,
      });
      expect(failingResult.didPass).toBe(false);
      expect(failingResult.message).toContain("5432 (Postgres)");

      // With database disabled and port 5432 in use, checkHostPorts ignores 5432 and passes
      const passingResult = await checkHostPorts(noDocker, "shop", inUse([5432]), {
        database: false,
      });
      expect(passingResult.didPass).toBe(true);
      expect(passingResult.message).toBe("Host ports 80, 443 are free");
    });

    it("skips checkPostgresCredentials when database capability is disabled", async () => {
      const result = await checkPostgresCredentials("/tmp/nonexistent", undefined as never, {
        database: false,
      });
      expect(result.didPass).toBe(true);
      expect(result.isSkipped).toBe(true);
      expect(result.message).toContain("Database capability is disabled");
    });

    it("skips checkSharedPlatformPostgres when database capability is disabled", () => {
      const result = checkSharedPlatformPostgres("/tmp/nonexistent", { database: false });
      expect(result.didPass).toBe(true);
      expect(result.isSkipped).toBe(true);
      expect(result.message).toContain("Database capability is disabled");
    });

    it("createDoctorReport omits postgres from ports and includes capabilities without database", () => {
      const report = createDoctorReport(
        [],
        true,
        [],
        {
          ingressHttp: 80,
          ingressHttps: 443,
          postgres: 5432,
          requested: { ingressHttp: 80, ingressHttps: 443, postgres: 5432 },
          explicit: { ingressHttp: false, ingressHttps: false, postgres: false },
          reason: { ingressHttp: "free", ingressHttps: "free", postgres: "free" },
        },
        undefined,
        [],
      );
      expect(report.data.capabilities).toEqual([]);
      expect(report.data.ports?.postgres).toBeUndefined();
      expect(report.data.ports?.http).toBeDefined();
      expect(report.data.ports?.https).toBeDefined();
    });
  });

  describe("TemplateEngine with database capability disabled", () => {
    it("filters database-management from alwaysEnabledInfra and phases", () => {
      const engine = new TemplateEngine();
      const config = makeProjectConfig({
        capabilities: { database: false },
      });
      const context = engine.buildContext(config);
      expect(context.alwaysEnabledInfra).not.toContain("database-management");
      expect(context.alwaysEnabledInfra).toContain("proxy");
      expect(context.phases.pre_alpha.enabledStacks).not.toContain("database-management");
      expect(context.phases.pre_alpha.enabledStacks).toContain("proxy");
    });
  });

  describe("Opting out on an already-generated project (flisk up --no-database)", () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

    function writeProject(root: string): void {
      mkdirSync(join(root, ".flisk"), { recursive: true });
      writeFileSync(
        join(root, ".flisk", "project.json"),
        JSON.stringify(
          makeProjectConfig({
            project: { name: "optout-project", version: "1.0.0" },
            overrides: { keep: "me" },
          }),
        ),
      );
    }

    it("saves capabilities.database=false once and keeps the rest of project.json", () => {
      const root = mkdtempSync(join(tmpdir(), "flisk-test-disable-db-"));
      try {
        writeProject(root);
        expect(disableDatabaseCapability(root)).toBe(true);
        const saved = JSON.parse(readFileSync(join(root, ".flisk", "project.json"), "utf-8"));
        expect(saved.capabilities).toEqual({ database: false });
        expect(saved.overrides).toEqual({ keep: "me" });
        expect(saved.phases.pre_alpha.enabledStacks).toContain("database-management");
        expect(isDatabaseCapabilityEnabled(root)).toBe(false);
        // A second run has nothing to change, so it does not regenerate again.
        expect(disableDatabaseCapability(root)).toBe(false);
        // No project.json: nothing to save.
        expect(disableDatabaseCapability(join(root, "missing"))).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("regenerating after the opt-out drops Postgres from spec.master and stays in sync", async () => {
      const root = mkdtempSync(join(tmpdir(), "flisk-test-regen-db-"));
      const oldExtensionSource = process.env.FLISK_EXTENSION_SOURCE;
      process.env.FLISK_EXTENSION_SOURCE = repoRoot;
      try {
        writeProject(root);
        const specPath = join(root, ".flisk", ".flisk-out", "spec.master");
        const composePath = join(
          root,
          "services",
          "platform",
          "database-management",
          "docker-compose.yml",
        );

        // The default project gets Postgres.
        await generateMasterConfigs(root, { quiet: true });
        expect(readFileSync(specPath, "utf-8")).toContain("database-management");
        expect(existsSync(composePath)).toBe(true);
        rmSync(composePath);

        expect(disableDatabaseCapability(root)).toBe(true);
        await generateMasterConfigs(root, { quiet: true });
        expect(readFileSync(specPath, "utf-8")).not.toContain("database-management");
        expect(existsSync(composePath)).toBe(false);
        expect(verifyMasterConfigs(root).errors).toEqual([]);
      } finally {
        if (oldExtensionSource === undefined) delete process.env.FLISK_EXTENSION_SOURCE;
        else process.env.FLISK_EXTENSION_SOURCE = oldExtensionSource;
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
