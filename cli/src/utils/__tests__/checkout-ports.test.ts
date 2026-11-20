// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, makeResource } from "../../test-support/index.js";
import { perCheckoutName, remapNativeServicePorts } from "../host-port-plan.js";
import { nativeRuntimePorts, nativeRuntimeUrls, planNativeRun } from "../native-runtime.js";

function projectWithName(root: string, json: Record<string, unknown>): void {
  mkdirSync(join(root, ".flisk"), { recursive: true });
  writeFileSync(join(root, ".flisk", "project.json"), JSON.stringify(json));
}

const api = () =>
  makeResource("api", "backend", {
    command: "node server.js",
    port: 4100,
    healthCheckPath: "/health",
    env: { SELF: "http://localhost:4100/self" },
  });
const web = () =>
  makeResource("web", "frontend", {
    command: "node web.js",
    port: 4200,
    dependsOn: ["api"],
    env: { API_URL: "http://localhost:4100/api", OTHER: "http://localhost:4200/local" },
  });

describe("perCheckoutName", () => {
  it("uses FLISK_CHECKOUT_NAME, normalised, before project metadata", () => {
    const root = createTempDir();
    projectWithName(root, { project: { name: "shop" }, worktree: { name: "agent-one" } });
    expect(perCheckoutName(root, { FLISK_CHECKOUT_NAME: "Agent_2" })).toBe("agent-2");
  });

  it("reads the name a worktree/checkout was created under from project.json", () => {
    const worktree = createTempDir();
    projectWithName(worktree, { project: { name: "shop" }, worktree: { name: "auth-agent" } });
    expect(perCheckoutName(worktree, {})).toBe("auth-agent");

    const checkout = createTempDir();
    projectWithName(checkout, { project: { name: "shop" }, checkout: { name: "billing-agent" } });
    expect(perCheckoutName(checkout, {})).toBe("billing-agent");
  });

  it("is absent for a normal single checkout", () => {
    const root = createTempDir();
    projectWithName(root, { project: { name: "shop" } });
    expect(perCheckoutName(root, {})).toBeUndefined();
  });
});

describe("remapNativeServicePorts", () => {
  it("keeps the declared port when it is free, even under a checkout name", async () => {
    const plans = planNativeRun([api(), web()]).services;
    const result = await remapNativeServicePorts(plans, "agent-one", {
      isAvailable: async () => true,
    });
    expect(result.ports.size).toBe(0);
    expect(plans.find((service) => service.name === "api")?.port).toBe(4100);
    expect(plans.find((service) => service.name === "api")?.env.PORT).toBe("4100");
  });

  it("remaps a busy port for one checkout and rewrites the dependent URLs", async () => {
    const resources = [api(), web()];
    const manifestBefore = JSON.stringify(resources.map((resource) => resource.config));
    const plans = planNativeRun(resources).services;

    const result = await remapNativeServicePorts(plans, "agent-two", {
      isAvailable: async (port) => port === 4101 || port === 4200,
    });

    const apiPlan = plans.find((service) => service.name === "api");
    const webPlan = plans.find((service) => service.name === "web");
    expect(result.ports.get("api")).toBe(4101);
    expect(apiPlan?.port).toBe(4101);
    expect(apiPlan?.env.PORT).toBe("4101");
    expect(apiPlan?.url).toBe("http://localhost:4101");
    expect(apiPlan?.healthUrl).toBe("http://localhost:4101/health");
    expect(webPlan?.env.API_URL).toBe("http://localhost:4101/api");
    expect(webPlan?.env.OTHER).toBe("http://localhost:4200/local");
    // A service's own URL is remapped too, and no manifest is touched.
    expect(apiPlan?.env.SELF).toBe("http://localhost:4101/self");
    expect(JSON.stringify(resources.map((resource) => resource.config))).toBe(manifestBefore);
  });

  it("does not remap without a checkout name, so a busy port stays a failure", async () => {
    const plans = planNativeRun([api()]).services;
    const result = await remapNativeServicePorts(plans, undefined, {
      isAvailable: async () => false,
    });
    expect(result.ports.size).toBe(0);
    expect(plans[0]?.port).toBe(4100);
    expect(plans[0]?.env.PORT).toBe("4100");
  });

  it("reuses a port chosen earlier in this run instead of probing it again", async () => {
    const plans = planNativeRun([api()]).services;
    const isAvailable = async () => false;
    const result = await remapNativeServicePorts(plans, "agent-two", {
      isAvailable,
      chosenPorts: new Map([["api", 4123]]),
    });
    expect(result.ports.get("api")).toBe(4123);
    expect(plans[0]?.env.PORT).toBe("4123");
    expect(plans[0]?.url).toBe("http://localhost:4123");
  });

  it("keeps two checkouts side by side on different runtime ports", async () => {
    const first = createTempDir();
    const second = createTempDir();
    projectWithName(first, { project: { name: "shop" }, worktree: { name: "main" } });
    projectWithName(second, { project: { name: "shop" }, worktree: { name: "review" } });

    expect(perCheckoutName(first, {})).toBe("main");
    expect(perCheckoutName(second, {})).toBe("review");

    const firstPlans = planNativeRun([api()]).services;
    const secondPlans = planNativeRun([api()]).services;
    await remapNativeServicePorts(firstPlans, "main", { isAvailable: async () => true });
    await remapNativeServicePorts(secondPlans, "review", {
      // The first checkout keeps 4100; only the second checkout moves.
      isAvailable: async (port) => port !== 4100,
    });

    expect(firstPlans[0]?.port).toBe(4100);
    expect(secondPlans[0]?.port).toBe(4101);
    expect(firstPlans[0]?.env.PORT).toBe("4100");
    expect(secondPlans[0]?.env.PORT).toBe("4101");
  });

  it("fails clearly when no free port is left in the checkout's range", async () => {
    const plans = planNativeRun([api()]).services;
    await expect(
      remapNativeServicePorts(plans, "agent-two", {
        isAvailable: async () => false,
        maxOffset: 2,
      }),
    ).rejects.toThrow(/No free port for service "api"/);
  });

  it("reports the real port and URL recorded in run.json to status", () => {
    const state = {
      pid: 1234,
      startedAt: new Date().toISOString(),
      services: {
        api: { port: 4101, url: "http://localhost:4101", ready: true },
        web: { port: 4200, url: "http://localhost:4200", ready: true },
      },
    };
    expect(nativeRuntimePorts(state).get("api")).toBe(4101);
    expect(nativeRuntimeUrls(state)).toEqual(["http://localhost:4101", "http://localhost:4200"]);
    expect(nativeRuntimePorts(null).size).toBe(0);
    expect(nativeRuntimeUrls(null)).toEqual([]);
  });

  it("leaves the service.json on disk byte-for-byte untouched", async () => {
    const root = createTempDir();
    const serviceDir = join(root, "services", "api");
    mkdirSync(serviceDir, { recursive: true });
    const serviceJson = join(serviceDir, "service.json");
    const manifest = JSON.stringify({ appName: "api", appType: "backend", port: 4100 }, null, 2);
    writeFileSync(serviceJson, manifest);
    const resources = [
      {
        ...api(),
        path: serviceDir,
        configPath: serviceJson,
        config: {
          appName: "api",
          appType: "backend" as const,
          command: "node server.js",
          port: 4100,
        },
      },
    ];
    const plans = planNativeRun(resources).services;
    await remapNativeServicePorts(plans, "agent-two", {
      isAvailable: async (port) => port !== 4100,
    });
    expect(readFileSync(serviceJson, "utf-8")).toBe(manifest);
  });
});
