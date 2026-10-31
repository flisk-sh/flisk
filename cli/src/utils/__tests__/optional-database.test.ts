// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TemplateEngine } from "../../generator/template-engine.js";
import type {
  DiscoveredResource,
  DiscoveredStack,
  ProjectConfig,
  ResourceConfig,
} from "../../types/index.js";
import {
  getEnabledCapabilities,
  isDatabaseCapabilityEnabled,
  resolveProjectCapabilities,
} from "../capabilities.js";
import { createDoctorReport } from "../doctor-report.js";
import { checkHostPorts } from "../doctor-runtime.js";
import { checkPostgresCredentials, checkSharedPlatformPostgres } from "../doctor-wiring.js";
import {
  getSharedInfrastructureList,
  groupSharedPostgres,
} from "../shared-infra.js";
import {
  databaseManagementEnabled,
  evaluateSharedPlatformPostgres,
} from "../shared-platform-postgres.js";

function makeResource(
  name: string,
  stack: string,
  config: Partial<ResourceConfig> = {},
): DiscoveredResource {
  return {
    name,
    path: `/test/${name}`,
    configPath: `/test/${name}/service.json`,
    stack,
    config: config as ResourceConfig,
  };
}

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
      expect(getEnabledCapabilities()).toContain("database");
      expect(getEnabledCapabilities()).toContain("gateway");
    });

    it("detects database disabled in top-level capabilities", () => {
      const config = { capabilities: { database: false } };
      expect(isDatabaseCapabilityEnabled(config)).toBe(false);
      const enabled = getEnabledCapabilities(config);
      expect(enabled).not.toContain("database");
      expect(enabled).toContain("gateway");
    });

    it("detects database disabled in project.capabilities", () => {
      const config = {
        project: { name: "demo", version: "1.0.0", capabilities: { database: false } },
      };
      expect(isDatabaseCapabilityEnabled(config)).toBe(false);
      const enabled = getEnabledCapabilities(config);
      expect(enabled).not.toContain("database");
    });

    it("detects database disabled via CLI options", () => {
      expect(isDatabaseCapabilityEnabled(null, { database: false })).toBe(false);
      expect(isDatabaseCapabilityEnabled(null, { "no-database": true })).toBe(false);
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

    it("reports only enabled capabilities when database is disabled", () => {
      const caps = resolveProjectCapabilities({ capabilities: { database: false } });
      expect(caps.database).toBe(false);
      expect(caps.gateway).toBe(true);
      const report = getEnabledCapabilities({ capabilities: { database: false } });
      expect(report).toEqual(["gateway", "watch", "healthcheck"]);
    });
  });

  describe("Shared Infrastructure with database disabled", () => {
    it("omits postgres from getSharedInfrastructureList when database capability is disabled", () => {
      const defaultList = getSharedInfrastructureList();
      expect(defaultList).toContain("postgres");

      const disabledList = getSharedInfrastructureList({ capabilities: { database: false } });
      expect(disabledList).not.toContain("postgres");
      expect(disabledList).toContain("gateway");
    });

    it("omits postgres from getSharedInfrastructureList with CLI options", () => {
      const disabledList = getSharedInfrastructureList("proj", [], { database: false });
      expect(disabledList).not.toContain("postgres");
      expect(disabledList).toContain("gateway");
    });

    it("groupSharedPostgres returns null when database capability is disabled", () => {
      const stacks = [
        makeStack("shop", [makeResource("api", "shop", { dependsOn: ["postgres"] })]),
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
        ["gateway", "watch", "healthcheck"],
      );
      expect(report.data.capabilities).toEqual(["gateway", "watch", "healthcheck"]);
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
});
