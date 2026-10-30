// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkServiceHealth, checkServiceSmoke } from "../doctor.js";

interface TestServerContext {
  server: http.Server;
  baseUrl: string;
  port: number;
}

function startLoopbackServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<TestServerContext> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${addr.port}`,
        port: addr.port,
      });
    });
  });
}

function stopServer(server?: http.Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server?.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

describe("doctor service health and smoke checks", () => {
  let tempProjectDir = "";
  let originalCwd = "";
  let originalBaseUrl: string | undefined;
  let activeServer: http.Server | undefined;

  beforeEach(() => {
    tempProjectDir = mkdtempSync(join(tmpdir(), "flisk-doctor-svc-test-"));
    originalCwd = process.cwd();
    originalBaseUrl = process.env.FLISK_SERVICE_BASE_URL;

    // Create a minimal Flisk project with a backend service declaring health and smoke checks
    writeFileSync(
      join(tempProjectDir, "flisk.json"),
      JSON.stringify({ name: "doctor-health-app" }, null, 2),
    );
    const serviceDir = join(tempProjectDir, "services", "api");
    mkdirSync(serviceDir, { recursive: true });
    writeFileSync(
      join(serviceDir, "service.json"),
      JSON.stringify(
        {
          appName: "api",
          appType: "backend",
          healthCheckPath: "/health",
          smoke: {
            via: "proxy",
            steps: [
              {
                name: "get-items",
                method: "GET",
                path: "/items",
                expect: 200,
              },
            ],
          },
        },
        null,
        2,
      ),
    );

    process.chdir(tempProjectDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalBaseUrl === undefined) {
      delete process.env.FLISK_SERVICE_BASE_URL;
    } else {
      process.env.FLISK_SERVICE_BASE_URL = originalBaseUrl;
    }
    await stopServer(activeServer);
    activeServer = undefined;
    rmSync(tempProjectDir, { recursive: true, force: true });
  });

  describe("Scenario A — Healthy service", () => {
    it("passes checkServiceHealth when local HTTP service responds 200 on /health", async () => {
      const { server, baseUrl } = await startLoopbackServer((req, res) => {
        if (req.url?.endsWith("/health")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "healthy" }));
          return;
        }
        res.writeHead(404);
        res.end("Not Found");
      });
      activeServer = server;
      process.env.FLISK_SERVICE_BASE_URL = baseUrl;

      const result = await checkServiceHealth(2000);

      expect(result.name).toBe("Service Health");
      expect(result.didPass).toBe(true);
      expect(result.isSkipped).toBeFalsy();
      expect(result.message).toContain("responding on /health");
    });
  });

  describe("Scenario B — Unreachable / unhealthy service", () => {
    it("fails checkServiceHealth when service endpoint returns HTTP 503 error", async () => {
      const { server, baseUrl } = await startLoopbackServer((req, res) => {
        if (req.url?.endsWith("/health")) {
          res.writeHead(503, { "Content-Type": "text/plain" });
          res.end("Service Unavailable");
          return;
        }
        res.writeHead(404);
        res.end("Not Found");
      });
      activeServer = server;
      process.env.FLISK_SERVICE_BASE_URL = baseUrl;

      const result = await checkServiceHealth(2000);

      expect(result.name).toBe("Service Health");
      expect(result.didPass).toBe(false);
      expect(result.message).toContain("not healthy");
      expect(result.message).toContain("503");
    });

    it("reports diagnostic failure when one service is healthy and another is unreachable", async () => {
      // Add a second backend service
      const workerDir = join(tempProjectDir, "services", "worker");
      mkdirSync(workerDir, { recursive: true });
      writeFileSync(
        join(workerDir, "service.json"),
        JSON.stringify(
          {
            appName: "worker",
            appType: "backend",
            healthCheckPath: "/health",
          },
          null,
          2,
        ),
      );

      const { server, baseUrl } = await startLoopbackServer((req, res) => {
        if (req.url?.endsWith("/api/health")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
        }
        if (req.url?.endsWith("/worker/health")) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Worker internal error");
          return;
        }
        res.writeHead(404);
        res.end("Not Found");
      });
      activeServer = server;
      process.env.FLISK_SERVICE_BASE_URL = baseUrl;

      const result = await checkServiceHealth(2000);

      expect(result.name).toBe("Service Health");
      expect(result.didPass).toBe(false);
      expect(result.message).toContain("1 service not healthy");
      expect(result.message).toContain("worker");
    });

    it("skips checkServiceHealth when no services respond (stack down semantics)", async () => {
      // Bind then close a loopback server so the port is known to have no listener
      const { server, port } = await startLoopbackServer((_req, res) => res.end());
      await stopServer(server);
      process.env.FLISK_SERVICE_BASE_URL = `http://127.0.0.1:${port}`;

      const result = await checkServiceHealth(100);

      expect(result.name).toBe("Service Health");
      expect(result.didPass).toBe(true);
      expect(result.isSkipped).toBe(true);
      expect(result.message).toContain("No services responded");
    });
  });

  describe("Scenario C — Non-2xx smoke response", () => {
    it("reports failure when a smoke request returns non-2xx status (HTTP 500)", async () => {
      const { server, baseUrl } = await startLoopbackServer((req, res) => {
        if (req.url?.endsWith("/health")) {
          // Health check returns 200 so stack is recognized as up and responsive
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
        }
        if (req.url?.endsWith("/items")) {
          // Smoke test returns 500
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal Database Failure" }));
          return;
        }
        res.writeHead(404);
        res.end("Not Found");
      });
      activeServer = server;
      process.env.FLISK_SERVICE_BASE_URL = baseUrl;

      const result = await checkServiceSmoke(2000);

      expect(result.name).toBe("Service Smoke");
      expect(result.didPass).toBe(false);
      expect(result.isSkipped).toBeFalsy();
      expect(result.message).toContain("failing a smoke check");
      expect(result.message).toContain("returned 500, expected 200");
    });

    it("reports failure when a smoke request returns HTTP 404", async () => {
      const { server, baseUrl } = await startLoopbackServer((req, res) => {
        if (req.url?.endsWith("/health")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
        }
        if (req.url?.endsWith("/items")) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Route not registered");
          return;
        }
        res.writeHead(404);
        res.end("Not Found");
      });
      activeServer = server;
      process.env.FLISK_SERVICE_BASE_URL = baseUrl;

      const result = await checkServiceSmoke(2000);

      expect(result.name).toBe("Service Smoke");
      expect(result.didPass).toBe(false);
      expect(result.message).toContain("failing a smoke check");
      expect(result.message).toContain("returned 404, expected 200");
    });

    it("passes checkServiceSmoke when smoke steps return 200", async () => {
      const { server, baseUrl } = await startLoopbackServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [1, 2, 3] }));
      });
      activeServer = server;
      process.env.FLISK_SERVICE_BASE_URL = baseUrl;

      const result = await checkServiceSmoke(2000);

      expect(result.name).toBe("Service Smoke");
      expect(result.didPass).toBe(true);
      expect(result.message).toContain("pass their smoke checks");
    });
  });
});
