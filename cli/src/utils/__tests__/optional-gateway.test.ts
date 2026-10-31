// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TemplateEngine } from "../../generator/template-engine.js";
import type { DiscoveredResource, HostPortPlan, ProjectConfig } from "../../types/index.js";
import {
  assertGatewayOptOutIsConfigured,
  getEnabledCapabilities,
  isGatewayEnabled,
} from "../capabilities.js";
import { runColdPreflight } from "../cold-preflight.js";
import { createDoctorReport } from "../doctor-report.js";
import { checkIngressPorts } from "../doctor-runtime.js";
import { FliskError } from "../errors.js";
import { getSharedInfrastructureItems, getSharedInfrastructureList } from "../shared-infra.js";
import { buildServicePorts, buildStackPorts } from "../status-ports.js";

function makeTempProject(config: Partial<ProjectConfig>): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "flisk-test-opt-gw-"));
  const fliskDir = join(root, ".flisk");
  mkdirSync(fliskDir, { recursive: true });
  writeFileSync(join(fliskDir, "project.json"), JSON.stringify(config, null, 2), "utf-8");
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

const mockResource = (name: string, appType: string, port?: number): DiscoveredResource =>
  ({
    name,
    path: "",
    configPath: "",
    port,
    config: { appName: name, appType },
  }) as never;

const samplePlan = {
  ingressHttp: 8080,
  ingressHttps: 8443,
  postgres: 15432,
  requested: { ingressHttp: 80, ingressHttps: 443, postgres: 5432 },
  explicit: { ingressHttp: false, ingressHttps: false, postgres: false },
  reason: { ingressHttp: "", ingressHttps: "", postgres: "" },
} as HostPortPlan;

describe("optional gateway capability", () => {
  describe("getSharedInfrastructureList and shared infra items", () => {
    it("omits Traefik from shared infrastructure when gateway capability is false", () => {
      const list = getSharedInfrastructureList({ capabilities: { gateway: false } });
      expect(list).not.toContain("traefik");
      expect(list).toContain("postgres");
    });

    it("omits Traefik when gateway: false is passed directly", () => {
      const list = getSharedInfrastructureList({ gateway: false });
      expect(list).not.toContain("traefik");
    });

    it("includes Traefik when gateway capability is true", () => {
      const list = getSharedInfrastructureList({ capabilities: { gateway: true } });
      expect(list).toContain("traefik");
    });

    it("includes Traefik by default when no capabilities are passed", () => {
      const list = getSharedInfrastructureList();
      expect(list).toContain("traefik");
    });

    it("omits Traefik when reading from .flisk/project.json on disk", () => {
      const { root, cleanup } = makeTempProject({
        version: "1.0",
        project: { name: "test-proj", version: "1.0.0" },
        capabilities: { gateway: false },
      });
      try {
        const list = getSharedInfrastructureList(root);
        expect(list).not.toContain("traefik");
      } finally {
        cleanup();
      }
    });

    it("filters shared infrastructure items to omit Traefik", () => {
      const items = getSharedInfrastructureItems({ capabilities: { gateway: false } });
      const names = items.map((i) => i.name);
      expect(names).not.toContain("traefik");
      expect(names).toContain("postgres");
    });
  });

  describe("isGatewayEnabled and getEnabledCapabilities", () => {
    it("reports isGatewayEnabled as false when disabled in capabilities", () => {
      expect(isGatewayEnabled({ capabilities: { gateway: false } })).toBe(false);
      expect(isGatewayEnabled({ gateway: false })).toBe(false);
    });

    it("reports isGatewayEnabled as true by default or when explicitly true", () => {
      expect(isGatewayEnabled()).toBe(true);
      expect(isGatewayEnabled({ capabilities: { gateway: true } })).toBe(true);
      expect(isGatewayEnabled({ capabilities: {} })).toBe(true);
    });

    it("getEnabledCapabilities reports only the capabilities that remain enabled", () => {
      const enabled = getEnabledCapabilities({ capabilities: { gateway: false } });
      expect(enabled).not.toContain("gateway");
      expect(enabled).toContain("database");
      expect(enabled).toContain("watch");
    });

    it("getEnabledCapabilities includes gateway when enabled", () => {
      const enabled = getEnabledCapabilities({ capabilities: { gateway: true } });
      expect(enabled).toContain("gateway");
    });

    it("resolves capabilities from project directory", () => {
      const { root, cleanup } = makeTempProject({
        version: "1.0",
        project: { name: "disabled-gw", version: "1.0.0" },
        capabilities: { gateway: false },
      });
      try {
        expect(isGatewayEnabled(root)).toBe(false);
        const caps = getEnabledCapabilities(root);
        expect(caps).not.toContain("gateway");
      } finally {
        cleanup();
      }
    });
  });

  describe("status-ports with optional gateway", () => {
    it("buildStackPorts excludes ingress ports when gateway capability is disabled", () => {
      const ports = buildStackPorts(samplePlan, 10350, { capabilities: { gateway: false } });
      const names = ports.map((p) => p.name);
      expect(names).not.toContain("ingress-http");
      expect(names).not.toContain("ingress-https");
      expect(names).toContain("tilt-ui");
      expect(names).toContain("postgres");
    });

    it("buildStackPorts includes ingress ports when gateway is enabled", () => {
      const ports = buildStackPorts(samplePlan, 10350, { capabilities: { gateway: true } });
      const names = ports.map((p) => p.name);
      expect(names).toContain("ingress-http");
      expect(names).toContain("ingress-https");
      expect(names).toContain("tilt-ui");
      expect(names).toContain("postgres");
    });

    it("buildServicePorts gives unrouted directUrl instead of Traefik url when gateway is disabled", () => {
      const res = mockResource("orders-api", "backend", 4000);
      const ports = buildServicePorts(res, 8080, { capabilities: { gateway: false } });
      expect(ports.url).toBeNull();
      expect(ports.directUrl).toBe("http://localhost:4000");
      expect(ports.containerPort).toBe(4000);
    });

    it("buildServicePorts gives Traefik ingress url when gateway is enabled", () => {
      const res = mockResource("orders-api", "backend", 4000);
      const ports = buildServicePorts(res, 8080, { capabilities: { gateway: true } });
      expect(ports.url).toMatch(/^http:\/\/.+:8080\/api\/orders$/);
      expect(ports.directUrl).toBeNull();
    });
  });

  describe("doctor checks avoidance when gateway is disabled", () => {
    it("checkIngressPorts returns skipped when gateway capability is disabled", () => {
      const result = checkIngressPorts(undefined, "test-project", [80, 443], {
        capabilities: { gateway: false },
      });
      expect(result.didPass).toBe(true);
      expect(result.isSkipped).toBe(true);
      expect(result.message).toContain("Gateway capability disabled");
    });

    it("cold preflight hostPortsItem skips HTTP/HTTPS ports when gateway is disabled", async () => {
      const preflight = await runColdPreflight({
        gateway: false,
        scope: "runtime",
      });
      const portItem = preflight.items.find((i) => i.id === "ports");
      if (portItem) {
        expect(portItem.message).not.toContain("HTTP ");
        expect(portItem.message).not.toContain("HTTPS ");
        expect(portItem.message).toContain("Postgres ");
      }
    });

    it("createDoctorReport includes only remaining enabled capabilities", () => {
      const remainingCaps = getEnabledCapabilities({ capabilities: { gateway: false } });
      const report = createDoctorReport([], true, [], samplePlan, undefined, remainingCaps);
      expect(report.data.capabilities).toBeDefined();
      expect(report.data.capabilities).not.toContain("gateway");
      expect(report.data.capabilities).toContain("database");
    });
  });

  describe("orchestration and template generation", () => {
    it("omits proxy and traefik from alwaysEnabledInfra in TemplateEngine when gateway is false", () => {
      const engine = new TemplateEngine();
      const config: ProjectConfig = {
        version: "1.0",
        project: { name: "test-project", version: "1.0.0" },
        capabilities: { gateway: false },
        phases: {
          pre_alpha: { name: "Pre-Alpha", description: "MVP", enabledStacks: [] },
          alpha: { name: "Alpha", description: "Alpha", enabledStacks: [] },
          beta: { name: "Beta", description: "Beta", enabledStacks: [] },
          out_of_scope: { name: "Out", description: "Out", enabledStacks: [] },
        },
        optional_infra: {
          monitoring: false,
          elk: false,
          debezium: false,
          golden_image: false,
          verdaccio: false,
        },
        discovery: { paths: ["services/*/*"] },
      };

      const context = engine.buildContext(config);
      expect(context.alwaysEnabledInfra).not.toContain("proxy");
      expect(context.alwaysEnabledInfra).not.toContain("traefik");
      expect(context.alwaysEnabledInfra).toContain("database-management");
    });
  });
});

describe("flisk up --no-gateway", () => {
  const projectWith = (capabilities: Record<string, boolean> | undefined): string => {
    const root = mkdtempSync(join(tmpdir(), "flisk-gw-flag-"));
    mkdirSync(join(root, ".flisk"), { recursive: true });
    writeFileSync(join(root, ".flisk", "project.json"), JSON.stringify({ capabilities }));
    return root;
  };

  it("is rejected when the project still has the gateway on (default)", () => {
    const root = projectWith(undefined);
    try {
      expect(() => assertGatewayOptOutIsConfigured(root)).toThrow(/project\.json/);
      expect(() => assertGatewayOptOutIsConfigured(null)).toThrow(FliskError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("is accepted once project.json sets capabilities.gateway to false", () => {
    const root = projectWith({ gateway: false });
    try {
      expect(() => assertGatewayOptOutIsConfigured(root)).not.toThrow();
      expect(isGatewayEnabled(root)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps proxy and traefik in the default project's always-enabled infra", () => {
    expect(getSharedInfrastructureList({})).toContain("traefik");
    expect(getSharedInfrastructureList({ capabilities: { gateway: false } })).not.toContain(
      "traefik",
    );
  });
});
