// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, makeResource } from "../../test-support/index.js";
import { planNativeRun, waitForServiceReady } from "../native-runtime.js";
import { healthCheckErrors, healthCheckPathOf, readinessProbeOf } from "../service-manifest.js";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as { port: number };
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe("readiness by port or command (#2875)", () => {
  it("accepts one probe and refuses two, a bad port and an empty command", () => {
    expect(healthCheckErrors({ healthCheck: { port: 9090 } }, "s")).toEqual([]);
    expect(
      healthCheckErrors({ healthCheck: { command: ["grpc_health_probe", "-addr=:9090"] } }, "s"),
    ).toEqual([]);
    expect(healthCheckErrors({ healthCheck: { path: "/health", port: 9090 } }, "s")).toEqual([
      's.healthCheck: set only one of "path", "port" or "command" (got "path" and "port")',
    ]);
    expect(healthCheckErrors({ healthCheck: { port: 70000 } }, "s")).toEqual([
      "s.healthCheck.port: expected a port from 1 to 65535",
    ]);
    expect(healthCheckErrors({ healthCheck: { command: [] } }, "s")[0]).toMatch(
      /s\.healthCheck\.command: expected the program and its arguments/,
    );
  });

  it("reads the probe, which replaces the HTTP path", () => {
    expect(readinessProbeOf({ healthCheck: { port: 9090 } })).toEqual({ kind: "port", port: 9090 });
    expect(readinessProbeOf({ healthCheck: { command: ["true"] } })).toEqual({
      kind: "command",
      command: ["true"],
    });
    expect(readinessProbeOf({ healthCheck: false })).toBeUndefined();
    expect(readinessProbeOf({ healthCheckPath: "/health" })).toBeUndefined();
    expect(
      healthCheckPathOf({ healthCheckPath: "/health", healthCheck: { port: 9090 } }, "/health"),
    ).toBeUndefined();
  });

  it("plans a local process with the probe and no health URL", () => {
    const plan = planNativeRun([
      makeResource("grpc", "backend", {
        command: "server",
        port: 4100,
        healthCheck: { port: 9090 },
      }),
    ]);
    expect(plan.services[0]).toMatchObject({
      readiness: { kind: "port", port: 9090 },
      healthUrl: undefined,
    });
  });

  it("waits for the probe port, not the service port", async () => {
    const [servicePort, probePort] = [await freePort(), await freePort()];
    const ready = waitForServiceReady(
      { port: servicePort, readiness: { kind: "port", port: probePort } },
      { isAlive: () => true, timeoutMs: 5_000, intervalMs: 50 },
    );
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(probePort, "127.0.0.1", resolve));
    try {
      expect(await ready).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("is ready once the command exits 0, run from the service folder with its env", async () => {
    const dir = createTempDir();
    const marker = join(dir, "ready");
    const check = {
      kind: "command" as const,
      command: ["sh", "-c", 'test -f ready && test "$TOKEN" = ok'],
    };
    const ready = waitForServiceReady(
      { port: undefined, readiness: check, cwd: dir, env: { TOKEN: "ok" } },
      { isAlive: () => true, timeoutMs: 5_000, intervalMs: 50 },
    );
    setTimeout(() => writeFileSync(marker, ""), 300);
    expect(await ready).toBe(true);

    const never = await waitForServiceReady(
      { port: undefined, readiness: { kind: "command", command: ["false"] } },
      { isAlive: () => true, timeoutMs: 400, intervalMs: 50 },
    );
    expect(never).toBe(false);
  });
});
