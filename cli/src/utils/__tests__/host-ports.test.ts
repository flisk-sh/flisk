// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { checkHostPorts, probeHostPort } from "../doctor-runtime.js";

const noDocker = (() => "") as never;
const inUse =
  (ports: number[]) =>
  async (port: number): Promise<"free" | "in-use" | "unknown"> =>
    ports.includes(port) ? "in-use" : "free";

describe("checkHostPorts", () => {
  it("passes when every port is free", async () => {
    const result = await checkHostPorts(noDocker, "shop", inUse([]));
    expect(result.didPass).toBe(true);
  });

  it("flags a local Postgres that no container accounts for", async () => {
    const result = await checkHostPorts(noDocker, "shop", inUse([5432]));
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("5432 (Postgres) is used by a program on this machine");
    expect(result.message).toContain("lsof -nP -iTCP:5432");
  });

  it("accepts ports published by this project's own containers", async () => {
    const dockerPs = "shop_postgres\t0.0.0.0:5432->5432/tcp\nshop_traefik\t0.0.0.0:80->80/tcp";
    const result = await checkHostPorts((() => dockerPs) as never, "shop", inUse([80, 5432]));
    expect(result.didPass).toBe(true);
  });

  it("flags 5432 published by another project's container", async () => {
    const dockerPs = "erp_postgres\t0.0.0.0:5432->5432/tcp";
    const result = await checkHostPorts((() => dockerPs) as never, "shop", inUse([5432]));
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("published by container erp_postgres");
  });

  it("leaves docker-held 80/443 to the ingress check", async () => {
    const dockerPs = "erp_traefik\t0.0.0.0:80->80/tcp";
    const result = await checkHostPorts((() => dockerPs) as never, "shop", inUse([80]));
    expect(result.didPass).toBe(true);
  });
});

describe("probeHostPort", () => {
  it("reports a port held on loopback as in use", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    try {
      expect(await probeHostPort(port)).toBe("in-use");
    } finally {
      server.close();
    }
  });

  it("reports a genuinely free port as free, not a false positive", async () => {
    // Regression test: probing 0.0.0.0 and 127.0.0.1 concurrently made the
    // second bind collide with our own first one on Linux (EADDRINUSE),
    // reporting every free port as taken. Probe several ephemeral ports:
    // a free port is unpredictable ahead of time, so ask the OS for one.
    for (let i = 0; i < 5; i++) {
      const probe = createServer();
      const port = await new Promise<number>((resolve) => {
        probe.listen(0, "127.0.0.1", () => {
          const { port } = probe.address() as { port: number };
          probe.close(() => resolve(port));
        });
      });
      expect(await probeHostPort(port)).toBe("free");
    }
  });

  it("reports a wildcard-bound listener as in use even when probed via loopback", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));
    const { port } = server.address() as { port: number };
    try {
      expect(await probeHostPort(port)).toBe("in-use");
    } finally {
      server.close();
    }
  });
});
