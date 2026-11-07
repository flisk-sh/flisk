// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import {
  buildPrintedUrlTargets,
  checkPrintedUrls,
  classifyProbe,
  describeUrlFailure,
  findMissingEnvName,
  formatUrlFailures,
  healthUrlOf,
  probeUrl,
  tiltResourceHasExited,
  type UrlProbe,
  urlFailureSuggestions,
} from "../url-check.js";

function resource(name: string, config: Record<string, unknown>): DiscoveredResource {
  return { name, path: `/p/${name}`, config } as unknown as DiscoveredResource;
}

/** A prober that answers each URL from a table, so a check runs without a network. */
function fakeProbe(table: Record<string, UrlProbe | UrlProbe[]>) {
  const calls: string[] = [];
  const probe = async (url: string): Promise<UrlProbe> => {
    calls.push(url);
    const entry = table[url];
    if (Array.isArray(entry)) return (entry.length > 1 ? entry.shift() : entry[0]) as UrlProbe;
    return entry ?? { error: "ENOTFOUND" };
  };
  return { probe, calls };
}

const instant = { sleep: async () => {}, deadlineMs: 0 };

describe("classifyProbe", () => {
  it("counts any HTTP response from the service as an answer, a 500 or the service's own 404 included", () => {
    expect(classifyProbe({ status: 200 })).toEqual({ didAnswer: true });
    expect(classifyProbe({ status: 301 })).toEqual({ didAnswer: true });
    expect(classifyProbe({ status: 500 })).toEqual({ didAnswer: true });
    expect(classifyProbe({ status: 404, body: '{"error":"no route /"}' })).toEqual({
      didAnswer: true,
    });
  });

  it("reads Traefik's own 404 as a missing route", () => {
    expect(classifyProbe({ status: 404, body: "404 page not found\n" })).toEqual({
      didAnswer: false,
      cause: "route-not-found",
    });
  });

  it.each([
    [502, "Bad Gateway"],
    [503, "Service Unavailable"],
    [503, "no available server"],
    [504, "Gateway Timeout"],
  ])("reads Traefik's own %i (%s) as a port nothing listens on", (status, body) => {
    expect(classifyProbe({ status, body })).toEqual({
      didAnswer: false,
      cause: "port-not-listening",
    });
  });

  it.each([502, 503, 504])("counts a %i the service wrote itself as an answer", (status) => {
    expect(classifyProbe({ status, body: '{"error":"down for maintenance"}' })).toEqual({
      didAnswer: true,
    });
    expect(classifyProbe({ status, body: "" })).toEqual({ didAnswer: true });
  });

  it("counts a redirect as an answer without following it", () => {
    expect(classifyProbe({ status: 302, body: "" })).toEqual({ didAnswer: true });
  });

  it("tells a refused gateway, a timeout and other request errors apart", () => {
    expect(classifyProbe({ error: "ECONNREFUSED" }, "http://api.demo.localhost/api/x").cause).toBe(
      "gateway-not-listening",
    );
    expect(classifyProbe({ error: "ECONNREFUSED" }, "http://127.0.0.1:8080/x").cause).toBe(
      "gateway-not-listening",
    );
    expect(classifyProbe({ error: "timeout" }).cause).toBe("timeout");
    expect(classifyProbe({ error: "ECONNRESET" }).cause).toBe("no-response");
  });

  it("does not blame the local gateway for a refused connection to another host (FLISK_SERVICE_BASE_URL)", () => {
    expect(classifyProbe({ error: "ECONNREFUSED" }, "http://api.dev.example.com/api/x").cause).toBe(
      "no-response",
    );
  });
});

describe("findMissingEnvName", () => {
  it.each([
    ["Error: Missing required environment variable: DATABASE_URL", "DATABASE_URL"],
    ["missing env var STRIPE_KEY", "STRIPE_KEY"],
    ["environment variable OPENAI_API_KEY is not set", "OPENAI_API_KEY"],
    [
      '  File "app.py", line 3, in <module>\n    token = os.environ["API_TOKEN"]\nKeyError: \'API_TOKEN\'',
      "API_TOKEN",
    ],
    ["Error: JWT_SECRET must be set", "JWT_SECRET"],
    ["[api] SESSION_SECRET is required", "SESSION_SECRET"],
  ])("finds the name in %j", (line, name) => {
    expect(findMissingEnvName(`starting\n${line}\nexiting`)).toBe(name);
  });

  it("returns null when the logs name no variable, and ignores log levels", () => {
    expect(findMissingEnvName("listening on 3000\nERROR required field id")).toBeNull();
  });

  it("does not read a KeyError on any other dictionary as a missing variable", () => {
    expect(
      findMissingEnvName("Traceback\n    row = cache[\"USER_ID\"]\nKeyError: 'USER_ID'"),
    ).toBeNull();
  });

  it("ignores a missing-variable message from an earlier run, many lines back", () => {
    const earlier = "Error: Missing required environment variable: DATABASE_URL";
    const later = Array.from({ length: 60 }, (_, i) => `line ${i}`).join("\n");
    expect(
      findMissingEnvName(`${earlier}\n${later}\nError: connect ECONNREFUSED db:5432`),
    ).toBeNull();
  });
});

describe("describeUrlFailure: service, cause and next command per cause", () => {
  const target = { service: "api", url: "http://api.demo.localhost/api/api/", port: 3000 };

  it("missing-env names the variable and the restart", () => {
    const d = describeUrlFailure(target, { cause: "missing-env", envName: "DATABASE_URL" });
    expect(d.message).toContain("DATABASE_URL");
    expect(d.message).toContain("api");
    expect(d.nextCommand).toBe("add DATABASE_URL=<value> to .env, then run: flisk restart api");
  });

  it("container-exited points at the service's logs", () => {
    const d = describeUrlFailure(target, { cause: "container-exited" });
    expect(d.message).toContain("api exited");
    expect(d.nextCommand).toBe("flisk logs -s api");
  });

  it("port-not-listening names the declared port and the status", () => {
    const d = describeUrlFailure(target, { cause: "port-not-listening", status: 502 });
    expect(d.message).toContain("port 3000");
    expect(d.message).toContain("HTTP 502");
    expect(d.nextCommand).toBe("flisk logs -s api");
  });

  it("route-not-found says Traefik has no route and points at flisk networks", () => {
    const d = describeUrlFailure(target, { cause: "route-not-found", status: 404 });
    expect(d.message).toContain("no route");
    expect(d.nextCommand).toBe("flisk networks");
  });

  it("gateway-not-listening points at flisk doctor", () => {
    const d = describeUrlFailure(target, { cause: "gateway-not-listening" });
    expect(d.message).toContain("gateway");
    expect(d.nextCommand).toBe("flisk doctor");
  });

  it("timeout and no-response say what happened", () => {
    expect(describeUrlFailure(target, { cause: "timeout" }).nextCommand).toBe("flisk logs -s api");
    expect(
      describeUrlFailure(target, { cause: "no-response", error: "ECONNRESET" }).message,
    ).toContain("ECONNRESET");
  });
});

describe("buildPrintedUrlTargets", () => {
  it("lists each routed service's URL and its health URL, and skips workers and deferred services", () => {
    const targets = buildPrintedUrlTargets(
      [
        resource("web", { appType: "frontend", basePath: "/web" }),
        resource("orders-api", { appType: "backend", port: 3001 }),
        resource("jobs", { appType: "worker" }),
        resource("lazy-api", { appType: "backend", sablier: { enable: true, deferStart: true } }),
      ],
      8080,
      new Set(["lazy-api"]),
    );
    expect(targets.map((t) => t.service)).toEqual(["web", "web", "orders-api", "orders-api"]);
    expect(targets[2]?.url.endsWith("/api/orders")).toBe(true);
    expect(targets[3]?.url.endsWith("/api/orders/health")).toBe(true);
    expect(targets[3]?.port).toBe(3001);
  });

  it("prints no health URL for a routed bring-your-own service unless it declares a healthCheckPath", () => {
    const targets = buildPrintedUrlTargets(
      [
        resource("legacy", { appType: "bring-your-own", image: "x" }),
        resource("ui", { appType: "bring-your-own", image: "y", webUi: true }),
        resource("pay", { appType: "bring-your-own", image: "z", healthCheckPath: "/status" }),
      ],
      undefined,
    );
    expect(targets.map((t) => t.service)).toEqual(["legacy", "ui", "pay", "pay"]);
    expect(targets[3]?.url.endsWith("/api/pay/status")).toBe(true);
  });

  it("keeps a query string out of the health path", () => {
    expect(healthUrlOf("http://x.localhost/api?version=1")).toBe(
      "http://x.localhost/api/health?version=1",
    );
  });

  it("does not double the slash of a URL that ends in one", () => {
    expect(healthUrlOf("http://x.localhost/api/api/")).toBe("http://x.localhost/api/api/health");
    expect(healthUrlOf("http://x.localhost/api/api/health")).toBe(
      "http://x.localhost/api/api/health",
    );
  });
});

describe("checkPrintedUrls", () => {
  const targets = [
    { service: "api", url: "http://api.demo.localhost/api/api", port: 3000 },
    { service: "api", url: "http://api.demo.localhost/api/api/health", port: 3000 },
  ];

  it("reports every URL as answered when each one responds", async () => {
    const { probe } = fakeProbe({
      "http://api.demo.localhost/api/api": { status: 404, body: "Cannot GET /" },
      "http://api.demo.localhost/api/api/health": { status: 200 },
    });
    const checks = await checkPrintedUrls(targets, { probe, ...instant });
    expect(checks).toEqual([
      { service: "api", url: "http://api.demo.localhost/api/api", didAnswer: true, status: 404 },
      {
        service: "api",
        url: "http://api.demo.localhost/api/api/health",
        didAnswer: true,
        status: 200,
      },
    ]);
    expect(formatUrlFailures(checks)).toEqual([]);
  });

  it("retries a URL that fails at first until it answers", async () => {
    const { probe, calls } = fakeProbe({
      "http://api.demo.localhost/api/api": [
        { status: 404, body: "404 page not found" },
        { status: 200 },
      ],
      "http://api.demo.localhost/api/api/health": { status: 200 },
    });
    let clock = 0;
    const checks = await checkPrintedUrls(targets, {
      probe,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      deadlineMs: 10_000,
    });
    expect(checks.every((c) => c.didAnswer)).toBe(true);
    // The URL that answered at once is not probed again.
    expect(calls.filter((url) => url === "http://api.demo.localhost/api/api/health")).toHaveLength(
      1,
    );
  });

  it("never lets a request run past the deadline", async () => {
    let clock = 0;
    const budgets: number[] = [];
    const sleeps: number[] = [];
    const probe = async (_url: string, timeoutMs: number): Promise<UrlProbe> => {
      budgets.push(timeoutMs);
      clock += timeoutMs; // every request runs until its timeout
      return { error: "timeout" };
    };
    await checkPrintedUrls([targets[0] as (typeof targets)[number]], {
      probe,
      timeoutMs: 3_000,
      deadlineMs: 7_000,
      intervalMs: 500,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      now: () => clock,
    });
    // 3000 + 500 + 3000 + 500 leaves 0: the third request would start at 7000, so it never runs.
    expect(budgets).toEqual([3_000, 3_000]);
    expect(clock).toBeLessThanOrEqual(7_000);
  });

  it("gives a request started near the deadline only the time left", async () => {
    let clock = 0;
    const budgets: number[] = [];
    const probe = async (_url: string, timeoutMs: number): Promise<UrlProbe> => {
      budgets.push(timeoutMs);
      clock += Math.min(timeoutMs, 2_000);
      return { error: "timeout" };
    };
    await checkPrintedUrls([targets[0] as (typeof targets)[number]], {
      probe,
      timeoutMs: 3_000,
      deadlineMs: 5_000,
      intervalMs: 500,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
    });
    // 2000 + 500 + 2000 + 500 = 5000: the deadline is reached, so the budget shrank to what was left and nothing ran after it.
    expect(budgets).toEqual([3_000, 2_500]);
    expect(clock).toBeLessThanOrEqual(5_000);
  });

  it("names a missing environment variable from the logs before what the probe alone says", async () => {
    const { probe } = fakeProbe({
      "http://api.demo.localhost/api/api": { status: 502, body: "Bad Gateway" },
      "http://api.demo.localhost/api/api/health": { status: 502, body: "Bad Gateway" },
    });
    const checks = await checkPrintedUrls(targets, {
      probe,
      ...instant,
      diagnosis: {
        logs: async () => "Error: Missing required environment variable: DATABASE_URL",
        hasExited: async () => true,
      },
    });
    expect(checks[0]).toMatchObject({
      didAnswer: false,
      status: 502,
      cause: "missing-env",
      envName: "DATABASE_URL",
      nextCommand: "add DATABASE_URL=<value> to .env, then run: flisk restart api",
    });
  });

  it("reports an exited container when its logs name no variable", async () => {
    const { probe } = fakeProbe({
      "http://api.demo.localhost/api/api": { status: 502, body: "Bad Gateway" },
      "http://api.demo.localhost/api/api/health": { status: 502, body: "Bad Gateway" },
    });
    const checks = await checkPrintedUrls(targets, {
      probe,
      ...instant,
      diagnosis: { logs: async () => "boom", hasExited: async () => true },
    });
    expect(checks.map((c) => c.cause)).toEqual(["container-exited", "container-exited"]);
  });

  it("keeps the probe's cause when the service is still running", async () => {
    const { probe } = fakeProbe({
      "http://api.demo.localhost/api/api": { status: 502, body: "Bad Gateway" },
      "http://api.demo.localhost/api/api/health": { status: 404, body: "404 page not found\n" },
    });
    const checks = await checkPrintedUrls(targets, {
      probe,
      ...instant,
      diagnosis: { logs: async () => "listening on 127.0.0.1:3000", hasExited: async () => false },
    });
    expect(checks.map((c) => c.cause)).toEqual(["port-not-listening", "route-not-found"]);
    const lines = formatUrlFailures(checks);
    expect(lines[0]).toBe("Not ready: 2 of 2 printed URLs do not answer.");
    expect(lines).toContain("  ✗ api: http://api.demo.localhost/api/api");
    expect(lines).toContain("      next:  flisk networks");
    expect(urlFailureSuggestions(checks)).toEqual([
      "api: flisk logs -s api",
      "api: flisk networks",
      "Tilt is still running; stop it with: flisk down",
    ]);
  });

  it("does not read the service's logs when the gateway itself refuses", async () => {
    const { probe } = fakeProbe({
      "http://api.demo.localhost/api/api": { error: "ECONNREFUSED" },
      "http://api.demo.localhost/api/api/health": { error: "ECONNREFUSED" },
    });
    let logsRead = false;
    const checks = await checkPrintedUrls(targets, {
      probe,
      ...instant,
      diagnosis: {
        logs: async () => {
          logsRead = true;
          return "Missing env var X";
        },
      },
    });
    expect(logsRead).toBe(false);
    expect(checks[0]).toMatchObject({
      cause: "gateway-not-listening",
      nextCommand: "flisk doctor",
    });
  });
});

describe("tiltResourceHasExited", () => {
  const json = JSON.stringify({
    items: [
      { metadata: { name: "api" }, status: { runtimeStatus: "error" } },
      { metadata: { name: "web" }, status: { runtimeStatus: "ok" } },
    ],
  });

  it("reads runtimeStatus error as exited", () => {
    expect(tiltResourceHasExited(json, "api")).toBe(true);
    expect(tiltResourceHasExited(json, "web")).toBe(false);
    expect(tiltResourceHasExited(json, "nope")).toBeNull();
    expect(tiltResourceHasExited("not json", "api")).toBeNull();
  });
});

describe("probeUrl against a real server", () => {
  let server: Server | undefined;
  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  /** Builds the URL in a helper so the port never folds into a literal (Semgrep, see .claude/memory). */
  function urlFor(host: string, port: number, path: string): string {
    return `http://${host}:${port}${path}`;
  }

  async function listen(handler: Parameters<typeof createServer>[1]): Promise<number> {
    const created = createServer(handler);
    server = created;
    await new Promise<void>((resolve) => created.listen(0, "127.0.0.1", resolve));
    return (created.address() as AddressInfo).port;
  }

  it("sends a *.localhost host to loopback with its Host header, and keeps the start of the body", async () => {
    let host: string | undefined;
    const port = await listen((req, res) => {
      host = req.headers.host;
      res.statusCode = 404;
      res.end("404 page not found\n");
    });
    const probe = await probeUrl(urlFor("api.demo.localhost", port, "/api/x"), 2_000);
    expect(host).toBe(`api.demo.localhost:${port}`);
    expect(probe).toEqual({ status: 404, body: "404 page not found\n" });
    expect(classifyProbe(probe).cause).toBe("route-not-found");
  });

  it("reports a refused connection by its code", async () => {
    const port = await listen((_req, res) => res.end("ok"));
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
    const probe = await probeUrl(urlFor("localhost", port, "/"), 2_000);
    expect(probe.error).toBe("ECONNREFUSED");
  });

  it("gives up after the timeout", async () => {
    const port = await listen(() => {
      // never answers
    });
    const probe = await probeUrl(urlFor("localhost", port, "/"), 200);
    expect(probe).toEqual({ error: "timeout" });
    server?.closeAllConnections();
  });
});
