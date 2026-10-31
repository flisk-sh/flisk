// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import { planNativeRun, waitForServiceReady } from "../native-runtime.js";
import {
  healthCheckErrors,
  isHealthCheckDisabled,
  parseHealthCheckConfig,
  validateServiceManifest,
} from "../service-manifest.js";
import {
  evaluateTiltReadiness,
  getDisabledHealthResourceNames,
  onlyEnabledResources,
  waitForTiltResourcesReady,
} from "../up-readiness.js";

const manifestBase = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  appName: "api",
  appType: "backend",
  stack: "core",
  ...overrides,
});

describe("health check manifest validation", () => {
  it("accepts healthCheck: false to explicitly disable health checks", () => {
    const manifest = manifestBase({ healthCheck: false });
    const { errors, warnings } = validateServiceManifest(manifest, "service.json");
    expect(errors).toEqual([]);
    expect(warnings).not.toContain("service.json.healthCheck: unknown field is preserved");
  });

  it("accepts healthCheck: true", () => {
    const manifest = manifestBase({ healthCheck: true });
    const { errors, warnings } = validateServiceManifest(manifest, "service.json");
    expect(errors).toEqual([]);
    expect(warnings).not.toContain("service.json.healthCheck: unknown field is preserved");
  });

  it("accepts a valid healthCheck configuration object", () => {
    const manifest = manifestBase({
      healthCheck: {
        enabled: true,
        interval: 1000,
        timeout: 500,
        retries: 3,
        path: "/status",
      },
    });
    const { errors, warnings } = validateServiceManifest(manifest, "service.json");
    expect(errors).toEqual([]);
    expect(warnings).not.toContain("service.json.healthCheck: unknown field is preserved");
  });

  it("accepts healthCheck with enabled: false", () => {
    const manifest = manifestBase({
      healthCheck: {
        enabled: false,
      },
    });
    const { errors } = validateServiceManifest(manifest, "service.json");
    expect(errors).toEqual([]);
  });

  it("accepts healthCheck object for native command services", () => {
    const manifest = {
      schemaVersion: 1,
      appName: "worker",
      appType: "worker",
      command: "node worker.js",
      port: 4000,
      healthCheck: {
        enabled: true,
        path: "/healthz",
      },
    };
    const { errors } = validateServiceManifest(manifest, "service.json");
    expect(errors).toEqual([]);
  });

  it("rejects non-boolean non-object healthCheck values", () => {
    for (const invalid of ["false", 123, ["/health"]]) {
      const errors = healthCheckErrors({ healthCheck: invalid }, "service.json");
      expect(errors).toContain(
        'service.json.healthCheck: expected true or false, or an object such as { "enabled": true, "path": "/health" }',
      );
    }
  });

  it("rejects unexpected keys in healthCheck object", () => {
    const errors = healthCheckErrors(
      { healthCheck: { enabled: true, foo: "bar", extra: 1 } },
      "service.json",
    );
    expect(errors).toContain(
      'service.json.healthCheck: unexpected key "foo" (expected "enabled", "interval", "timeout", "retries", or "path")',
    );
    expect(errors).toContain(
      'service.json.healthCheck: unexpected key "extra" (expected "enabled", "interval", "timeout", "retries", or "path")',
    );
  });

  it("rejects non-boolean enabled in healthCheck object", () => {
    const errors = healthCheckErrors({ healthCheck: { enabled: "yes" } }, "service.json");
    expect(errors).toContain("service.json.healthCheck.enabled: expected true or false");
  });

  it("rejects non-positive numbers for interval and timeout", () => {
    const errors = healthCheckErrors({ healthCheck: { interval: 0, timeout: -5 } }, "service.json");
    expect(errors).toContain("service.json.healthCheck.interval: expected a positive number");
    expect(errors).toContain("service.json.healthCheck.timeout: expected a positive number");
  });

  it("rejects invalid retries counts", () => {
    const errors = healthCheckErrors({ healthCheck: { retries: -1 } }, "service.json");
    expect(errors).toContain("service.json.healthCheck.retries: expected a non-negative integer");
  });

  it("rejects invalid path format in healthCheck object", () => {
    const missingSlash = healthCheckErrors({ healthCheck: { path: "health" } }, "service.json");
    expect(missingSlash).toContain(
      "service.json.healthCheck.path: must be a path such as /health (no spaces, line breaks or YAML syntax)",
    );

    const withSpaces = healthCheckErrors(
      { healthCheck: { path: "/health check" } },
      "service.json",
    );
    expect(withSpaces).toContain(
      "service.json.healthCheck.path: must be a path such as /health (no spaces, line breaks or YAML syntax)",
    );
  });

  it("catches unsafe path injection through validateGeneratedStringFields", () => {
    const manifest = manifestBase({
      healthCheck: { path: "/health\n  privileged: true" },
    });
    const { errors } = validateServiceManifest(manifest, "service.json");
    expect(errors.some((err) => err.includes("service.json.healthCheck.path"))).toBe(true);
  });
});

describe("health check configuration parsing", () => {
  it("parses healthCheck: false", () => {
    expect(parseHealthCheckConfig(false)).toEqual({ enabled: false });
    expect(parseHealthCheckConfig({ healthCheck: false })).toEqual({ enabled: false });
    expect(
      parseHealthCheckConfig(manifestBase({ healthCheck: false, healthCheckPath: "/health" })),
    ).toEqual({ enabled: false });
  });

  it("parses healthCheck: { enabled: false }", () => {
    expect(parseHealthCheckConfig({ enabled: false })).toEqual({ enabled: false });
    expect(parseHealthCheckConfig({ healthCheck: { enabled: false } })).toEqual({ enabled: false });
  });

  it("parses complete healthCheck object configuration", () => {
    const config = {
      enabled: true,
      interval: 5000,
      timeout: 2000,
      retries: 3,
      path: "/livez",
    };
    expect(parseHealthCheckConfig(config)).toEqual(config);
    expect(parseHealthCheckConfig(manifestBase({ healthCheck: config }))).toEqual(config);
  });

  it("inherits healthCheckPath when path is omitted in healthCheck object", () => {
    const parsed = parseHealthCheckConfig(
      manifestBase({
        healthCheck: { enabled: true, timeout: 1000 },
        healthCheckPath: "/custom-health",
      }),
    );
    expect(parsed).toEqual({
      enabled: true,
      path: "/custom-health",
      timeout: 1000,
    });
  });

  it("falls back to traefik.healthCheck when healthCheckPath is absent", () => {
    const parsed = parseHealthCheckConfig(
      manifestBase({
        traefik: { healthCheck: "/traefik-health" },
      }),
    );
    expect(parsed).toEqual({
      enabled: true,
      path: "/traefik-health",
    });
  });

  it("disables health checks when path is omitted for unopinionated services", () => {
    const unopinionatedManifest = {
      schemaVersion: 1,
      appName: "cmd-api",
      appType: "backend",
      command: "node server.js",
      port: 3000,
    };
    expect(parseHealthCheckConfig(unopinionatedManifest)).toEqual({ enabled: false });
    expect(isHealthCheckDisabled(unopinionatedManifest)).toBe(true);
  });

  it("enables health checks when path is specified on unopinionated service", () => {
    const withPath = {
      schemaVersion: 1,
      appName: "cmd-api",
      appType: "backend",
      command: "node server.js",
      port: 3000,
      healthCheckPath: "/status",
    };
    expect(parseHealthCheckConfig(withPath)).toEqual({
      enabled: true,
      path: "/status",
    });
    expect(isHealthCheckDisabled(withPath)).toBe(false);

    const withObject = {
      schemaVersion: 1,
      appName: "cmd-api",
      appType: "backend",
      command: "node server.js",
      port: 3000,
      healthCheck: { path: "/healthz" },
    };
    expect(parseHealthCheckConfig(withObject)).toEqual({
      enabled: true,
      path: "/healthz",
    });
    expect(isHealthCheckDisabled(withObject)).toBe(false);
  });

  it("detects isHealthCheckDisabled accurately across configurations", () => {
    expect(isHealthCheckDisabled({ healthCheck: false })).toBe(true);
    expect(isHealthCheckDisabled({ healthCheck: { enabled: false } })).toBe(true);
    expect(isHealthCheckDisabled({ command: "node server.js" })).toBe(true);
    expect(isHealthCheckDisabled({ command: "node server.js", healthCheckPath: "/h" })).toBe(false);
    expect(isHealthCheckDisabled({ command: "node server.js", healthCheck: { path: "/h" } })).toBe(
      false,
    );
    expect(isHealthCheckDisabled(manifestBase())).toBe(false);
  });
});

describe("native runner readiness with disabled health checks", () => {
  it("treats service as ready immediately once alive when health checks are disabled", async () => {
    const plan = {
      port: 8080,
      healthCheckDisabled: true,
    };
    let aliveCalls = 0;
    const isAlive = () => {
      aliveCalls += 1;
      return true;
    };

    const ready = await waitForServiceReady(plan, {
      isAlive,
      timeoutMs: 50,
      intervalMs: 10,
    });

    expect(ready).toBe(true);
    expect(aliveCalls).toBe(1);
  });

  it("fails immediately when service is dead and health checks are disabled", async () => {
    const plan = {
      port: 8080,
      healthCheckDisabled: true,
    };

    const ready = await waitForServiceReady(plan, {
      isAlive: () => false,
      timeoutMs: 50,
    });

    expect(ready).toBe(false);
  });

  it("plans native run with healthCheckDisabled: true when healthCheck: false", () => {
    const resources: DiscoveredResource[] = [
      {
        name: "no-health-service",
        path: "/tmp/test",
        configPath: "/tmp/test/service.json",
        config: {
          appName: "no-health-service",
          appType: "backend",
          command: "node server.js",
          port: 4000,
          healthCheck: false,
        },
      },
    ];

    const runPlan = planNativeRun(resources);
    expect(runPlan.errors).toEqual([]);
    const service = runPlan.services[0];
    expect(service.healthCheckDisabled).toBe(true);
    expect(service.healthUrl).toBeUndefined();
  });

  it("plans native run with healthCheckDisabled: true when health path is omitted", () => {
    const resources: DiscoveredResource[] = [
      {
        name: "unopinionated-service",
        path: "/tmp/test",
        configPath: "/tmp/test/service.json",
        config: {
          appName: "unopinionated-service",
          appType: "backend",
          command: "node server.js",
          port: 4000,
        },
      },
    ];

    const runPlan = planNativeRun(resources);
    expect(runPlan.errors).toEqual([]);
    const service = runPlan.services[0];
    expect(service.healthCheckDisabled).toBe(true);
    expect(service.healthUrl).toBeUndefined();
  });

  it("plans native run with healthUrl when custom path is provided in healthCheck object", () => {
    const resources: DiscoveredResource[] = [
      {
        name: "custom-health-service",
        path: "/tmp/test",
        configPath: "/tmp/test/service.json",
        config: {
          appName: "custom-health-service",
          appType: "backend",
          command: "node server.js",
          port: 4000,
          healthCheck: {
            enabled: true,
            path: "/custom-ping",
          },
        },
      },
    ];

    const runPlan = planNativeRun(resources);
    expect(runPlan.errors).toEqual([]);
    const service = runPlan.services[0];
    expect(service.healthCheckDisabled).toBe(false);
    expect(service.healthUrl).toBe("http://localhost:4000/custom-ping");
  });
});

describe("Tilt readiness with disabled health checks", () => {
  const containerWithHealth = (name: string, healthStatus: string, runtimeStatus = "ok") => ({
    metadata: { name },
    status: {
      updateStatus: "ok",
      runtimeStatus,
      composeResourceInfo: { healthStatus },
    },
  });

  it("strips health status in onlyEnabledResources for disabled-health services", () => {
    const json = JSON.stringify({
      items: [containerWithHealth("api", "starting"), containerWithHealth("db", "starting")],
    });

    const stripped = onlyEnabledResources(json, new Set(["api"]));
    const parsed = JSON.parse(stripped);
    expect(parsed.items[0].status.composeResourceInfo.healthStatus).toBeUndefined();
    expect(parsed.items[1].status.composeResourceInfo.healthStatus).toBe("starting");
  });

  it("treats running container as ready immediately when health check is starting but disabled", () => {
    const json = JSON.stringify({
      items: [containerWithHealth("api", "starting")],
    });

    // Without disabledHealth: starting health check makes it pending
    const withoutDisabled = evaluateTiltReadiness(json, new Set());
    expect(withoutDisabled.result.ready).toBe(false);
    expect(withoutDisabled.result.pending).toBe(1);

    // With disabledHealth: treated as ready immediately
    const withDisabled = evaluateTiltReadiness(json, new Set(), undefined, new Set(["api"]));
    expect(withDisabled.result.ready).toBe(true);
    expect(withDisabled.result.pending).toBe(0);
  });

  it("treats running container as ready when health check is unhealthy but disabled", () => {
    const json = JSON.stringify({
      items: [containerWithHealth("api", "unhealthy")],
    });

    // Without disabledHealth: unhealthy causes a failure
    const withoutDisabled = evaluateTiltReadiness(json, new Set());
    expect(withoutDisabled.result.ready).toBe(false);
    expect(withoutDisabled.result.failures).toHaveLength(1);

    // With disabledHealth: container is ok, so ready is true
    const withDisabled = evaluateTiltReadiness(json, new Set(), undefined, new Set(["api"]));
    expect(withDisabled.result.ready).toBe(true);
    expect(withDisabled.result.failures).toHaveLength(0);
  });

  it("preserves container runtime errors even when health check is disabled", () => {
    const json = JSON.stringify({
      items: [containerWithHealth("api", "starting", "error")],
    });

    const evaluated = evaluateTiltReadiness(json, new Set(), undefined, new Set(["api"]));
    expect(evaluated.result.ready).toBe(false);
    expect(evaluated.result.failures.map((f) => f.name)).toEqual(["api"]);
  });

  it("waitForTiltResourcesReady resolves ready immediately with disabledHealth", async () => {
    const json = JSON.stringify({
      items: [containerWithHealth("api", "starting")],
    });

    const result = await waitForTiltResourcesReady(1, {
      intervalMs: 1,
      timeoutMs: 100,
      deferred: new Set(),
      disabledHealth: new Set(["api"]),
      fetchJson: async () => json,
    });

    expect(result.ready).toBe(true);
  });

  it("getDisabledHealthResourceNames identifies services with disabled health checks", () => {
    const resources: DiscoveredResource[] = [
      {
        name: "svc-disabled-bool",
        path: "/a",
        configPath: "/a/service.json",
        config: { appName: "a", appType: "backend", healthCheck: false },
      },
      {
        name: "svc-disabled-obj",
        path: "/b",
        configPath: "/b/service.json",
        config: { appName: "b", appType: "backend", healthCheck: { enabled: false } },
      },
      {
        name: "svc-unopinionated-no-path",
        path: "/c",
        configPath: "/c/service.json",
        config: { appName: "c", appType: "backend", command: "node s.js" },
      },
      {
        name: "svc-enabled",
        path: "/d",
        configPath: "/d/service.json",
        config: { appName: "d", appType: "backend", healthCheckPath: "/health" },
      },
    ];

    const disabledNames = getDisabledHealthResourceNames(resources);
    expect(disabledNames).toEqual(
      new Set(["svc-disabled-bool", "svc-disabled-obj", "svc-unopinionated-no-path"]),
    );
  });
});
