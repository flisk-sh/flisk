// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readProjectConfig, TemplateEngine } from "../../generator/template-engine.js";
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
import { getHostPortPlan, writeSavedHostPortPlan } from "../host-port-config.js";
import {
  createHostPortPlan,
  formatHostPortPlan,
  GATEWAY_DISABLED_REASON,
} from "../host-port-plan.js";
import { getSharedInfrastructureItems, getSharedInfrastructureList } from "../shared-infra.js";
import { buildSmokePlans } from "../smoke.js";
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
      expect(enabled).toEqual(["database"]);
    });

    it("lists only the capabilities something reads, so status --json does not report unused flags as on", () => {
      expect(getEnabledCapabilities({})).toEqual(["gateway", "database"]);
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

    it("buildServicePorts gives a routed backend no url and no directUrl when gateway is disabled", () => {
      // Its container publishes no host port, so localhost:4000 would not answer either.
      const res = mockResource("orders-api", "backend", 4000);
      const ports = buildServicePorts(res, 8080, { capabilities: { gateway: false } });
      expect(ports.url).toBeNull();
      expect(ports.directUrl).toBeNull();
      expect(ports.containerPort).toBe(4000);
    });

    it("buildServicePorts keeps the localhost directUrl of an unrouted worker when gateway is disabled", () => {
      const res = mockResource("mailer", "worker", 4100);
      const ports = buildServicePorts(res, 8080, { gateway: false });
      expect(ports.url).toBeNull();
      expect(ports.directUrl).toBe("http://localhost:4100");
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

  describe("host port planning when gateway is disabled", () => {
    const savedHttpPort = process.env.FLISK_HTTP_PORT;
    afterEach(() => {
      if (savedHttpPort === undefined) delete process.env.FLISK_HTTP_PORT;
      else process.env.FLISK_HTTP_PORT = savedHttpPort;
    });

    it("createHostPortPlan never probes 80/443 and ignores a busy FLISK_HTTP_PORT", async () => {
      process.env.FLISK_HTTP_PORT = "8080";
      const probed: number[] = [];
      const plan = await createHostPortPlan({
        gateway: false,
        isAvailable: async (port) => {
          probed.push(port);
          return port !== 8080;
        },
      });
      expect(probed).toEqual([15432]);
      expect(plan.postgres).toBe(15432);
      expect(plan.reason.ingressHttp).toBe(GATEWAY_DISABLED_REASON);
      expect(formatHostPortPlan(plan)).toBe("Host ports: Postgres 15432");
    });

    it("getHostPortPlan reads capabilities.gateway from project.json and plans only Postgres", async () => {
      const { root, cleanup } = makeTempProject({
        version: "1.0",
        project: { name: "no-gw", version: "1.0.0" },
        capabilities: { gateway: false },
      });
      try {
        const probed: number[] = [];
        const plan = await getHostPortPlan(root, {
          inspectDocker: false,
          isPortFree: async (port) => {
            probed.push(port);
            return true;
          },
        });
        expect(probed).not.toContain(80);
        expect(probed).not.toContain(443);
        expect(plan.reason.ingressHttps).toBe(GATEWAY_DISABLED_REASON);
      } finally {
        cleanup();
      }
    });

    it("plans HTTP/HTTPS again once the gateway is back on after a run without it", async () => {
      const { root, cleanup } = makeTempProject({
        version: "1.0",
        project: { name: "gw-back", version: "1.0.0" },
      });
      try {
        const offPlan = await createHostPortPlan({
          env: {},
          gateway: false,
          isAvailable: async () => true,
        });
        writeSavedHostPortPlan(root, offPlan);
        const probed: number[] = [];
        const plan = await getHostPortPlan(root, {
          isPortFree: async (port) => {
            probed.push(port);
            return port !== 80;
          },
        });
        expect(plan.reason.ingressHttp).not.toBe(GATEWAY_DISABLED_REASON);
        expect(plan.ingressHttp).toBe(8080);
        expect(probed).toContain(443);
      } finally {
        cleanup();
      }
    });

    it("keeps planning 80/443 by default", async () => {
      const probed: number[] = [];
      await createHostPortPlan({
        env: {},
        isAvailable: async (port) => {
          probed.push(port);
          return true;
        },
      });
      expect(probed).toEqual([80, 443, 15432]);
    });
  });

  describe("smoke checks when gateway is disabled", () => {
    it("buildSmokePlans makes no plan, since smoke steps go through the gateway URL", () => {
      const res = {
        ...mockResource("orders-api", "backend", 4000),
        config: { appName: "orders-api", appType: "backend", smoke: [{ path: "/health" }] },
      } as never as DiscoveredResource;
      expect(buildSmokePlans([res], 8080)).toHaveLength(1);
      expect(buildSmokePlans([res], 8080, { gateway: false })).toEqual([]);
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

    it("drops a proxy or traefik phase entry when gateway is false, so RESOURCE_DEFAULTS cannot start Traefik", () => {
      const engine = new TemplateEngine();
      const phases = (enabledStacks: string[]) => ({
        pre_alpha: { name: "Pre-Alpha", description: "MVP", enabledStacks },
        alpha: { name: "Alpha", description: "Alpha", enabledStacks: ["traefik"] },
        beta: { name: "Beta", description: "Beta", enabledStacks: [] },
        out_of_scope: { name: "Out", description: "Out", enabledStacks: [] },
      });
      const base = {
        version: "1.0",
        project: { name: "test-project", version: "1.0.0" },
        phases: phases(["proxy", "orders"]),
        optional_infra: {
          monitoring: false,
          elk: false,
          debezium: false,
          golden_image: false,
          verdaccio: false,
        },
        discovery: { paths: ["services/*/*"] },
      } satisfies ProjectConfig;

      const off = engine.buildContext({ ...base, capabilities: { gateway: false } });
      expect(off.phases.pre_alpha.enabledStacks).toEqual(["orders"]);
      expect(off.phases.alpha.enabledStacks).toEqual([]);
      const specMaster = engine.generateAll({ ...base, capabilities: { gateway: false } })[
        "spec.master"
      ];
      expect(specMaster).not.toContain('"proxy": True');
      expect(engine.generateAll(base)["spec.master"]).toContain('"proxy": True');

      const on = engine.buildContext(base);
      expect(on.phases.pre_alpha.enabledStacks).toEqual(["proxy", "orders"]);
      expect(on.phases.alpha.enabledStacks).toEqual(["traefik"]);
    });
  });

  describe("project.json capabilities validation", () => {
    const validProject = {
      version: "1.0",
      project: { name: "caps-proj", version: "1.0.0" },
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

    it.each([
      ["an array", [false]],
      ["null", null],
      ["a string", "gateway"],
      ["a non-boolean value", { gateway: "false" }],
    ])("rejects capabilities that is %s", (_label, capabilities) => {
      const { root, cleanup } = makeTempProject({ ...validProject, capabilities } as never);
      try {
        expect(() => readProjectConfig(root)).toThrow(/Invalid project\.json/);
      } finally {
        cleanup();
      }
    });

    it("accepts a project.json without capabilities, or with boolean ones", () => {
      for (const extra of [{}, { capabilities: { gateway: false, database: true } }]) {
        const { root, cleanup } = makeTempProject({ ...validProject, ...extra } as never);
        try {
          expect(readProjectConfig(root).capabilities).toEqual(
            "capabilities" in extra ? extra.capabilities : undefined,
          );
        } finally {
          cleanup();
        }
      }
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
