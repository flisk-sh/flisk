// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatSmokeFailure, runSmokePlan, type SmokePlan } from "../smoke.js";

// Same shape as scripts/verify-smoke.sh, but against a local server and real fetch: no Docker, no Tilt.
describe("smoke over real HTTP", () => {
  let server: Server;
  let baseUrl: string;
  let recordDir: string;
  let healthCalls: number;
  let writes: number;

  beforeEach(async () => {
    healthCalls = 0;
    writes = 0;
    recordDir = mkdtempSync(join(tmpdir(), "smoke-http-"));
    const records = new Map<string, string>();
    server = createServer((req, res) => {
      const send = (status: number, body: string) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(body);
      };
      const url = req.url ?? "";
      if (url === "/api/svc/health") {
        // Not ready for the first two probes, like a route Traefik has not registered yet.
        return healthCalls++ < 2 ? send(404, "404 page not found") : send(200, '{"status":"ok"}');
      }
      if (url === "/api/svc/never-ready") {
        return send(503, "Service Unavailable");
      }
      if (req.method === "POST" && url === "/api/svc/records") {
        writes++;
        records.set("a1", "smoke");
        return send(201, '{"id":"a1","name":"smoke"}');
      }
      const match = url.match(/^\/api\/svc\/records\/(\w+)$/);
      if (req.method === "GET" && match?.[1] && records.has(match[1])) {
        return send(200, '{"id":"a1","name":"smoke"}');
      }
      if (url === "/api/svc/error") {
        return send(500, '{"error":"internal server error"}');
      }
      send(404, "404 page not found");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/svc`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(recordDir, { recursive: true, force: true });
  });

  const plan = (readPath: string): SmokePlan => ({
    name: "svc",
    baseUrl,
    readyPath: "/health",
    smoke: {
      via: "proxy",
      timeoutSeconds: 10,
      steps: [
        {
          name: "create",
          method: "POST",
          path: "/records",
          body: { name: "smoke" },
          expect: 201,
          save: { id: "$.id" },
        },
        { name: "read back", path: readPath, expect: 200, bodyContains: "smoke" },
      ],
    },
  });

  // A fake clock that sleep() advances, so waiting out `timeoutSeconds` costs no real time.
  const deps = () => {
    let t = 0;
    return {
      recordDir,
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
    };
  };
  const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));

  it("waits for the route, writes once, and keeps a success record", async () => {
    const result = await runSmokePlan(plan("/records/{{id}}"), deps());
    expect(result.ok).toBe(true);
    expect(healthCalls).toBe(3);
    expect(writes).toBe(1);
    const dir = join(recordDir, "svc", "read-back");
    expect(json(join(dir, "last-success.json")).status).toBe(200);
    expect(readFileSync(join(dir, "last-success-body.txt"), "utf8")).toContain("smoke");
  });

  it("a missing route fails with the URL, 404 and body, and keeps the earlier success", async () => {
    await runSmokePlan(plan("/records/{{id}}"), deps());
    const result = await runSmokePlan(plan("/missing/{{id}}"), deps());
    expect(result.ok).toBe(false);
    const dir = join(recordDir, "svc", "read-back");
    expect(result.recordPath).toBe(join(dir, "latest.json"));
    expect(formatSmokeFailure(result)).toContain("record:");
    const latest = json(join(dir, "latest.json"));
    expect(latest.url).toBe(`${baseUrl}/missing/a1`);
    expect(latest.status).toBe(404);
    expect(readFileSync(join(dir, "body.txt"), "utf8").trim()).not.toBe("");
    expect(existsSync(join(dir, "last-success-body.txt"))).toBe(true);
    expect(readFileSync(join(dir, "last-success-body.txt"), "utf8")).toContain("smoke");
    expect(json(join(dir, "last-success.json")).status).toBe(200);
    // The first run created once; the failed run created once more. Neither repeated a write.
    expect(writes).toBe(2);
    expect(healthCalls).toBeGreaterThanOrEqual(3);
  });

  it("times out when an endpoint never returns expected status within budget", async () => {
    const neverReadyPlan: SmokePlan = {
      name: "svc",
      baseUrl,
      readyPath: "/never-ready",
      smoke: {
        via: "proxy",
        timeoutSeconds: 2,
        steps: [{ name: "check-ready", path: "/never-ready", expect: 200 }],
      },
    };

    const result = await runSmokePlan(neverReadyPlan, deps());
    expect(result.ok).toBe(false);
    expect(result.failure).toContain("returned 503, expected 200");
  });

  it("fails when expected body substring is missing", async () => {
    const mismatchPlan: SmokePlan = {
      name: "svc",
      baseUrl,
      smoke: {
        via: "proxy",
        timeoutSeconds: 2,
        steps: [
          {
            name: "check-health",
            path: "/health",
            expect: 200,
            bodyContains: "nonexistent-token",
          },
        ],
      },
    };

    const result = await runSmokePlan(mismatchPlan, deps());
    expect(result.ok).toBe(false);
    expect(result.failure).toContain('body does not contain "nonexistent-token"');
  });

  it("fails when server returns 500 error", async () => {
    const errorPlan: SmokePlan = {
      name: "svc",
      baseUrl,
      smoke: {
        via: "proxy",
        timeoutSeconds: 2,
        steps: [
          {
            name: "call-error",
            path: "/error",
            expect: 200,
          },
        ],
      },
    };

    const result = await runSmokePlan(errorPlan, deps());
    expect(result.ok).toBe(false);
    expect(result.failure).toContain("returned 500, expected 200");
  });
});
