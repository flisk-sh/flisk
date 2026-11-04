// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import type { AddressInfo } from "node:net";
import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import { planNativeRun, waitForServiceReady } from "../native-runtime.js";
import {
  healthCheckErrors,
  healthCheckPathOf,
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
        interval: 10,
        timeout: 5,
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
      'service.json.healthCheck: unexpected key "foo" (expected "enabled", "interval", "timeout", "startPeriod", "retries", "path", "port", or "command")',
    );
    expect(errors).toContain(
      'service.json.healthCheck: unexpected key "extra" (expected "enabled", "interval", "timeout", "startPeriod", "retries", "path", "port", or "command")',
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
  it("parses healthCheck: false and { enabled: false } as disabled", () => {
    expect(parseHealthCheckConfig({ healthCheck: false })).toEqual({ enabled: false });
    expect(
      parseHealthCheckConfig(manifestBase({ healthCheck: false, healthCheckPath: "/health" })),
    ).toEqual({ enabled: false });
    expect(parseHealthCheckConfig({ healthCheck: { enabled: false } })).toEqual({ enabled: false });
  });

  it("parses a complete healthCheck object", () => {
    const healthCheck = { enabled: true, interval: 5, timeout: 2, retries: 3, path: "/livez" };
    expect(parseHealthCheckConfig(manifestBase({ healthCheck }))).toEqual(healthCheck);
  });

  it("inherits healthCheckPath when healthCheck.path is omitted", () => {
    const parsed = parseHealthCheckConfig(
      manifestBase({ healthCheck: { timeout: 1 }, healthCheckPath: "/custom-health" }),
    );
    expect(parsed).toEqual({ enabled: true, path: "/custom-health", timeout: 1 });
  });

  it("does not read traefik.healthCheck as the container probe path", () => {
    const parsed = parseHealthCheckConfig(
      manifestBase({ traefik: { healthCheck: "/traefik-health" } }),
      { defaultPath: "/health" },
    );
    expect(parsed).toEqual({ enabled: true, path: "/health" });
  });

  it("keeps health checks on for a command service without a health path", () => {
    const commandManifest = {
      schemaVersion: 1,
      appName: "cmd-api",
      appType: "backend",
      command: "node server.js",
      port: 3000,
    };
    expect(parseHealthCheckConfig(commandManifest)).toEqual({ enabled: true });
    expect(isHealthCheckDisabled(commandManifest)).toBe(false);
  });

  it("uses healthCheck.path over healthCheckPath", () => {
    expect(
      healthCheckPathOf({ healthCheck: { path: "/healthz" }, healthCheckPath: "/status" }),
    ).toBe("/healthz");
    expect(healthCheckPathOf({ healthCheckPath: "/status" })).toBe("/status");
    expect(healthCheckPathOf({ healthCheck: true }, "/health")).toBe("/health");
    expect(healthCheckPathOf({})).toBeUndefined();
  });

  // isHealthCheckDisabled and parseHealthCheckConfig used to disagree on this shape: one said disabled, the other enabled.
  it("agrees with isHealthCheckDisabled for every healthCheck shape", () => {
    const shapes: Array<Record<string, unknown>> = [
      {},
      { healthCheck: true },
      { healthCheck: false },
      { healthCheck: {} },
      { healthCheck: { enabled: false } },
      { healthCheck: { enabled: true } },
      { healthCheck: { interval: 10 } },
      { command: "node server.js" },
      { command: "node server.js", healthCheck: { interval: 10 } },
      { command: "node server.js", healthCheck: { timeout: 2, retries: 1 } },
      { command: "node server.js", healthCheckPath: "/h" },
      { command: "node server.js", healthCheck: false },
    ];
    for (const shape of shapes) {
      expect(parseHealthCheckConfig(shape).enabled, JSON.stringify(shape)).toBe(
        !isHealthCheckDisabled(shape),
      );
    }
    expect(
      isHealthCheckDisabled({ command: "node server.js", healthCheck: { interval: 10 } }),
    ).toBe(false);
  });

  it("disables health checks only for false or enabled: false", () => {
    expect(isHealthCheckDisabled({ healthCheck: false })).toBe(true);
    expect(isHealthCheckDisabled({ healthCheck: { enabled: false } })).toBe(true);
    expect(isHealthCheckDisabled({ command: "node server.js" })).toBe(false);
    expect(isHealthCheckDisabled({ command: "node server.js", healthCheckPath: "/h" })).toBe(false);
    expect(isHealthCheckDisabled(manifestBase())).toBe(false);
    expect(isHealthCheckDisabled(undefined)).toBe(false);
  });
});

const nativeResource = (config: Record<string, unknown>): DiscoveredResource => ({
  name: String(config.appName),
  path: "/tmp/test",
  configPath: "/tmp/test/service.json",
  config: {
    appType: "backend",
    command: "node server.js",
    port: 4000,
    ...config,
  } as DiscoveredResource["config"],
});

/** A TCP server on a free port that starts listening only when `listen()` is called. */
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

describe("native runner readiness with health checks", () => {
  it("treats a disabled-health service as ready once it is still alive", async () => {
    const ready = await waitForServiceReady(
      { port: 8080, healthCheckDisabled: true },
      { isAlive: () => true, timeoutMs: 50, intervalMs: 10 },
    );
    expect(ready).toBe(true);
  });

  it("fails a disabled-health service that has exited", async () => {
    const ready = await waitForServiceReady(
      { port: 8080, healthCheckDisabled: true },
      { isAlive: () => false, timeoutMs: 50 },
    );
    expect(ready).toBe(false);
  });

  it("plans healthCheckDisabled for healthCheck: false", () => {
    const service = planNativeRun([nativeResource({ appName: "off", healthCheck: false })])
      .services[0];
    expect(service.healthCheckDisabled).toBe(true);
    expect(service.healthUrl).toBeUndefined();
  });

  it("does not disable readiness for a command service without a health path", () => {
    const service = planNativeRun([nativeResource({ appName: "plain" })]).services[0];
    expect(service.healthCheckDisabled).toBeUndefined();
    expect(service.healthUrl).toBeUndefined();
    expect(service.port).toBe(4000);
  });

  it("does not disable readiness for healthCheck: { interval } without a path", () => {
    const service = planNativeRun([
      nativeResource({ appName: "timed", healthCheck: { interval: 5 } }),
    ]).services[0];
    expect(service.healthCheckDisabled).toBeUndefined();
    expect(service.healthUrl).toBeUndefined();
  });

  it("probes healthCheck.path when set", () => {
    const service = planNativeRun([
      nativeResource({ appName: "custom", healthCheck: { enabled: true, path: "/custom-ping" } }),
    ]).services[0];
    expect(service.healthCheckDisabled).toBeUndefined();
    expect(service.healthUrl).toBe("http://localhost:4000/custom-ping");
  });

  // Regression: a command service without healthCheckPath was planned as health-disabled, so it counted as ready as soon
  // as its process was alive, and its dependents started before it listened.
  // The listen comes after the 1s grace a service without any readiness signal gets, so only a real port wait passes.
  it("waits for the port of a command service without a health path to listen", async () => {
    const port = await freePort();
    const plan = planNativeRun([nativeResource({ appName: "slow", port })]).services[0];
    const server = createServer();
    let isListening = false;
    const timer = setTimeout(() => {
      server.listen(port, "127.0.0.1", () => {
        isListening = true;
      });
    }, 1_500);
    try {
      const ready = await waitForServiceReady(plan, {
        isAlive: () => true,
        timeoutMs: 5_000,
        intervalMs: 20,
      });
      expect(ready).toBe(true);
      expect(isListening).toBe(true);
    } finally {
      clearTimeout(timer);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("does not report a command service without a health path ready while nothing listens", async () => {
    const port = await freePort();
    const plan = planNativeRun([nativeResource({ appName: "never", port })]).services[0];
    const ready = await waitForServiceReady(plan, {
      isAlive: () => true,
      timeoutMs: 200,
      intervalMs: 20,
    });
    expect(ready).toBe(false);
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
        name: "svc-command-no-path",
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
    expect(disabledNames).toEqual(new Set(["svc-disabled-bool", "svc-disabled-obj"]));
  });
});
