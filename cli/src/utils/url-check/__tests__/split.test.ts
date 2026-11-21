// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { makeResource } from "../../../test-support/index.js";
import {
  buildPrintedUrlTargets as buildTargetsFromHub,
  classifyProbe as classifyFromHub,
} from "../../url-check.js";
import {
  classifyProbe,
  describeUrlFailure,
  findMissingEnvName,
  healthUrlOf,
  isLocalGatewayUrl,
  printedHealthUrl,
  type UrlFailureCause,
  type UrlProbe,
} from "../classify.js";
import {
  checkPrintedUrls,
  URL_CHECK_CONCURRENCY,
  URL_CHECK_DEADLINE_MS,
  URL_PROBE_TIMEOUT_MS,
  URL_SLOW_DEADLINE_MS,
} from "../probe.js";
import {
  buildPrintedUrlTargets,
  buildPrintedUrlTargets as buildTargetsFromTargets,
} from "../targets.js";

const instant = { sleep: async () => {}, deadlineMs: 0 };

describe("url-check split (#4910): the taxonomy is pure and table-tested", () => {
  it.each([
    [{ error: "ECONNREFUSED" }, "http://api.demo.localhost/x", "gateway-not-listening"],
    [{ status: 404, body: "404 page not found" }, undefined, "route-not-found"],
    [{ status: 502, body: "Bad Gateway" }, undefined, "port-not-listening"],
    [{ status: 503, body: "no available server" }, undefined, "port-not-listening"],
    [{ status: 504, body: "Gateway Timeout" }, undefined, "port-not-listening"],
    [{ error: "timeout" }, undefined, "timeout"],
    [{ error: "ECONNRESET" }, undefined, "no-response"],
    [{ error: "ECONNREFUSED" }, "http://api.dev.example.com/x", "no-response"],
    [{ status: 200 }, undefined, undefined],
    [{ status: 404, body: '{"error":"no route /"}' }, undefined, undefined],
  ])("classifyProbe(%j, %s) is %s", (probe: UrlProbe, url: string | undefined, cause) => {
    const result = classifyProbe(probe, url);
    expect(result.cause).toBe(cause);
    expect(result.didAnswer).toBe(cause === undefined);
  });

  it.each([
    "gateway-not-listening",
    "route-not-found",
    "port-not-listening",
    "container-exited",
    "missing-env",
    "timeout",
    "no-response",
  ] as const)(
    "describeUrlFailure names a message and a next command for every cause: %s",
    (cause: UrlFailureCause) => {
      const described = describeUrlFailure(
        { service: "api", url: "http://api.demo.localhost/api", port: 3000 },
        { cause, status: 502, envName: "DATABASE_URL", error: "ECONNRESET" },
      );
      expect(described.message.length).toBeGreaterThan(0);
      expect(described.nextCommand.length).toBeGreaterThan(0);
    },
  );

  it("the timeout message names the probe timeout", () => {
    const described = describeUrlFailure(
      { service: "api", url: "http://api.demo.localhost/api" },
      { cause: "timeout" },
    );
    expect(described.message).toContain(`${URL_PROBE_TIMEOUT_MS / 1000}s`);
  });

  it("findMissingEnvName, healthUrlOf and isLocalGatewayUrl stay pure helpers of classify.ts", () => {
    expect(findMissingEnvName("Error: Missing required environment variable: DATABASE_URL")).toBe(
      "DATABASE_URL",
    );
    expect(healthUrlOf("http://x.localhost/api?version=1")).toBe(
      "http://x.localhost/api/health?version=1",
    );
    expect(isLocalGatewayUrl("http://api.demo.localhost/x")).toBe(true);
    expect(isLocalGatewayUrl("http://api.dev.example.com/x")).toBe(false);
    expect(
      printedHealthUrl(
        makeResource("pay", "bring-your-own", { image: "z", healthCheckPath: "/status" }),
        "http://pay.demo.localhost/api/pay",
      ),
    ).toBe("http://pay.demo.localhost/api/pay/status");
  });
});

describe("url-check split (#4910): targets are data, the probe is the only network path", () => {
  it("buildPrintedUrlTargets lists each service URL and health URL from targets.ts", () => {
    const targets = buildPrintedUrlTargets(
      [
        makeResource("web", "frontend", { basePath: "/web" }),
        makeResource("orders-api", "backend", { port: 3001 }),
      ],
      8080,
    );
    expect(targets.map((t) => t.service)).toEqual(["web", "web", "orders-api", "orders-api"]);
    expect(targets[3]?.url.endsWith("/api/orders/health")).toBe(true);
    expect(targets[3]?.port).toBe(3001);
  });

  it("the hub re-exports the same functions as the split modules", () => {
    expect(buildTargetsFromHub).toBe(buildTargetsFromTargets);
    expect(classifyFromHub).toBe(classifyProbe);
  });

  it("the probe tuning constants keep their values", () => {
    expect(URL_PROBE_TIMEOUT_MS).toBe(3_000);
    expect(URL_CHECK_DEADLINE_MS).toBe(15_000);
    expect(URL_SLOW_DEADLINE_MS).toBe(60_000);
    expect(URL_CHECK_CONCURRENCY).toBe(8);
  });

  it("a timing-out URL is retried past the usual deadline only through the fake prober seam", async () => {
    let clock = 0;
    const probe = async (): Promise<UrlProbe> => {
      if (clock < 40_000) {
        clock += 3_000;
        return { error: "timeout" };
      }
      return { status: 200 };
    };
    const checks = await checkPrintedUrls(
      [{ service: "api", url: "http://api.demo.localhost/api/api" }],
      {
        probe,
        timeoutMs: 3_000,
        deadlineMs: 15_000,
        intervalMs: 500,
        sleep: async (ms) => {
          clock += ms;
        },
        now: () => clock,
      },
    );
    expect(checks[0]?.didAnswer).toBe(true);
    expect(clock).toBeGreaterThan(15_000);
  });

  it("the concurrency limit caps in-flight fake probes", async () => {
    let inFlight = 0;
    let peak = 0;
    const many = Array.from({ length: 20 }, (_, i) => ({
      service: `svc-${i}`,
      url: `http://api.demo.localhost/api/svc-${i}`,
    }));
    const probe = async (): Promise<UrlProbe> => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return { status: 200 };
    };
    const checks = await checkPrintedUrls(many, { probe, ...instant, concurrency: 4 });
    expect(checks).toHaveLength(20);
    expect(checks.every((c) => c.didAnswer)).toBe(true);
    expect(peak).toBe(4);
  });
});
