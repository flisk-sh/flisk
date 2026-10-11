// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import {
  buildSmokePlans,
  formatSmokeFailure,
  readOnlySmokePlans,
  runSmokePlan,
  SMOKE_RECORD_BODY_MAX_BYTES,
  type SmokeConfig,
  type SmokePlan,
  validateSmoke,
} from "../smoke.js";

const SMOKE: SmokeConfig = {
  via: "proxy",
  timeoutSeconds: 5,
  steps: [
    {
      name: "create",
      method: "POST",
      path: "/records",
      body: { name: "smoke" },
      expect: 201,
      save: { id: "$.id" },
    },
    { name: "read back", path: "/records/{{id}}", expect: 200, bodyContains: "smoke" },
  ],
};

function resource(
  name: string,
  appType: string,
  config: Record<string, unknown> = {},
): DiscoveredResource {
  return {
    name,
    path: `/tmp/${name}`,
    configPath: `/tmp/${name}/service.json`,
    config: { appName: name, appType, ...config } as DiscoveredResource["config"],
  };
}

type Call = { url: string; method: string; body?: string };
type Reply = { status: number; body?: string } | Error;

/** A fake fetch that answers from a queue per "METHOD url" and records every call. */
function fakeFetch(replies: Record<string, Reply[]>) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: { method: string; body?: string }) => {
    calls.push({ url, method: init.method, body: init.body });
    const queue = replies[`${init.method} ${url}`];
    const next = queue && queue.length > 1 ? queue.shift() : queue?.[0];
    if (!next) throw new Error(`unexpected request ${init.method} ${url}`);
    if (next instanceof Error) throw next;
    return { status: next.status, text: async () => next.body ?? "" };
  };
  return { fetch, calls };
}

function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

const PLAN: SmokePlan = {
  name: "orders-api",
  baseUrl: "http://api.shop.localhost/api/orders",
  smoke: SMOKE,
};

describe("validateSmoke", () => {
  it("accepts the documented example", () => {
    expect(validateSmoke(SMOKE)).toEqual([]);
  });

  it("rejects any via other than proxy", () => {
    expect(validateSmoke({ ...SMOKE, via: "container" }).join("\n")).toMatch(/via.*proxy/);
  });

  it("rejects a step without a path, and a path that would skip the proxy", () => {
    const errors = validateSmoke({
      via: "proxy",
      steps: [{ expect: 200 }, { path: "http://localhost:3000/health" }, { path: "records" }],
    }).join("\n");
    expect(errors).toMatch(/steps\[0\].*path/);
    expect(errors).toMatch(/steps\[1\].*path/);
    expect(errors).toMatch(/steps\[2\].*path/);
  });

  it("rejects an empty steps list and a bad expect or timeout", () => {
    expect(validateSmoke({ via: "proxy", steps: [] }).join("\n")).toMatch(/steps/);
    expect(
      validateSmoke({ via: "proxy", timeoutSeconds: 0, steps: [{ path: "/a", expect: 99 }] }).join(
        "\n",
      ),
    ).toMatch(/timeoutSeconds[\s\S]*expect/);
  });
});

describe("buildSmokePlans", () => {
  it("builds one plan per routable resource that declares smoke, from the URL tdk up prints", () => {
    const plans = buildSmokePlans(
      [
        resource("orders-api", "backend", { smoke: SMOKE }),
        resource("shop-web", "frontend", { smoke: { ...SMOKE, steps: [{ path: "/" }] } }),
        resource("plain-api", "backend"),
      ],
      8080,
    );
    expect(plans.map((p) => [p.name, p.baseUrl])).toEqual([
      ["orders-api", expect.stringMatching(/^http:\/\/.*:8080\/api\/orders$/)],
      ["shop-web", expect.stringMatching(/^http:\/\/.*:8080\/shop-web$/)],
    ]);
  });

  it("polls healthCheckPath before the first step, defaulting to /health for APIs only", () => {
    const [api, custom, web, byo] = buildSmokePlans([
      resource("orders-api", "backend", { smoke: SMOKE }),
      resource("ping-api", "backend", { smoke: SMOKE, healthCheckPath: "/healthz" }),
      resource("shop-web", "frontend", { smoke: SMOKE }),
      resource("byo", "bring-your-own", { smoke: SMOKE }),
    ]);
    expect(api?.readyPath).toBe("/health");
    expect(custom?.readyPath).toBe("/healthz");
    expect(web?.readyPath).toBeUndefined();
    expect(byo?.readyPath).toBeUndefined();
  });

  it("skips workers and bring-your-own with exposeViaProxy false", () => {
    const plans = buildSmokePlans([
      resource("jobs", "worker", { smoke: SMOKE }),
      resource("byo", "bring-your-own", { smoke: SMOKE, exposeViaProxy: false }),
    ]);
    expect(plans).toEqual([]);
  });

  it("honours apiPath and basePath", () => {
    const [api, web] = buildSmokePlans([
      resource("orders-api", "backend", { smoke: SMOKE, apiPath: "/v2/orders" }),
      resource("shop-web", "frontend", { smoke: SMOKE, basePath: "/shop" }),
    ]);
    expect(api?.baseUrl).toMatch(/\/v2\/orders$/);
    expect(web?.baseUrl).toMatch(/\/shop$/);
  });
});

describe("runSmokePlan", () => {
  const base = PLAN.baseUrl;

  it("writes, saves the id, reads it back through the proxy URL, and passes", async () => {
    const { fetch, calls } = fakeFetch({
      [`POST ${base}/records`]: [{ status: 201, body: '{"id":"abc"}' }],
      [`GET ${base}/records/abc`]: [{ status: 200, body: '{"id":"abc","name":"smoke"}' }],
    });
    const result = await runSmokePlan(PLAN, { fetch, ...clock() });
    expect(result).toEqual({ name: "orders-api", ok: true });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${base}/records`,
      `GET ${base}/records/abc`,
    ]);
    expect(JSON.parse(calls[0]?.body ?? "")).toEqual({ name: "smoke" });
  });

  it("fails with url, method, status and a body snippet when the proxy keeps answering 404", async () => {
    const { fetch } = fakeFetch({
      [`POST ${base}/records`]: [{ status: 404, body: "404 page not found" }],
    });
    const result = await runSmokePlan(PLAN, { fetch, ...clock() });
    expect(result.ok).toBe(false);
    expect(result.failure).toContain(`POST ${base}/records`);
    expect(result.failure).toContain("404");
    expect(result.failure).toContain("404 page not found");
    expect(result.failure).toContain("expected 201");
  });

  it("keeps trying a not-ready route until it comes up, within the timeout", async () => {
    const { fetch, calls } = fakeFetch({
      [`POST ${base}/records`]: [
        Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } }),
        { status: 404 },
        { status: 503 },
        { status: 201, body: '{"id":"9"}' },
      ],
      [`GET ${base}/records/9`]: [{ status: 200, body: "smoke" }],
    });
    const result = await runSmokePlan(PLAN, { fetch, ...clock() });
    expect(result.ok).toBe(true);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(4);
  });

  it("does not retry a real answer with the wrong status (a write must not be repeated)", async () => {
    const { fetch, calls } = fakeFetch({
      [`POST ${base}/records`]: [{ status: 500, body: "boom" }],
    });
    const result = await runSmokePlan(PLAN, { fetch, ...clock() });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(1);
    expect(result.failure).toContain("500");
  });

  it("does not repeat a POST after an error that may have reached the service (timeout, reset, unknown)", async () => {
    for (const err of [
      Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" }),
      Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } }),
      new Error("something odd"),
    ]) {
      const { fetch, calls } = fakeFetch({ [`POST ${base}/records`]: [err] });
      const result = await runSmokePlan(PLAN, { fetch, ...clock() });
      expect(result.ok).toBe(false);
      expect(calls).toHaveLength(1);
      expect(result.failure).toContain("never answered");
    }
  });

  it("retries a GET after any error until the timeout", async () => {
    const plan: SmokePlan = { ...PLAN, smoke: { via: "proxy", steps: [{ path: "/x" }] } };
    const { fetch, calls } = fakeFetch({
      [`GET ${base}/x`]: [
        new Error("socket hang up"),
        new Error("socket hang up"),
        { status: 200 },
      ],
    });
    expect((await runSmokePlan(plan, { fetch, ...clock() })).ok).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it("reports a malformed smoke block as a failed result instead of throwing", async () => {
    const plan = { ...PLAN, smoke: { via: "proxy" } } as unknown as SmokePlan;
    const { fetch, calls } = fakeFetch({});
    const result = await runSmokePlan(plan, { fetch, ...clock() });
    expect(result.ok).toBe(false);
    expect(result.failure).toContain("smoke.steps");
    expect(calls).toHaveLength(0);
  });

  it("fails when the read-back body does not contain the expected text", async () => {
    const { fetch } = fakeFetch({
      [`POST ${base}/records`]: [{ status: 201, body: '{"id":"abc"}' }],
      [`GET ${base}/records/abc`]: [{ status: 200, body: '{"id":"abc","name":"other"}' }],
    });
    const result = await runSmokePlan(PLAN, { fetch, ...clock() });
    expect(result.ok).toBe(false);
    expect(result.failure).toContain('"smoke"');
    expect(result.failure).toContain("read back");
  });

  it("fails when a saved field is missing from the response", async () => {
    const { fetch } = fakeFetch({
      [`POST ${base}/records`]: [{ status: 201, body: '{"nope":1}' }],
    });
    const result = await runSmokePlan(PLAN, { fetch, ...clock() });
    expect(result.ok).toBe(false);
    expect(result.failure).toContain("$.id");
  });

  it("reads nested and indexed save paths", async () => {
    const plan: SmokePlan = {
      ...PLAN,
      smoke: {
        via: "proxy",
        steps: [
          { method: "POST", path: "/x", expect: 200, save: { id: "$.data.items[1].id" } },
          { path: "/x/{{id}}", expect: 200 },
        ],
      },
    };
    const { fetch, calls } = fakeFetch({
      [`POST ${base}/x`]: [{ status: 200, body: '{"data":{"items":[{"id":1},{"id":"two"}]}}' }],
      [`GET ${base}/x/two`]: [{ status: 200 }],
    });
    expect((await runSmokePlan(plan, { fetch, ...clock() })).ok).toBe(true);
    expect(calls[1]?.url).toBe(`${base}/x/two`);
  });
});

describe("readiness gate", () => {
  const base = PLAN.baseUrl;
  const gated: SmokePlan = { ...PLAN, readyPath: "/health" };

  it("sends no write until a GET to the health path is answered, and never repeats the write", async () => {
    const reset = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
    const { fetch, calls } = fakeFetch({
      [`GET ${base}/health`]: [
        reset,
        { status: 404 },
        { status: 503 },
        { status: 500 },
        { status: 200 },
      ],
      [`POST ${base}/records`]: [{ status: 201, body: '{"id":"a1"}' }],
      [`GET ${base}/records/a1`]: [{ status: 200, body: "smoke" }],
    });
    expect((await runSmokePlan(gated, { fetch, ...clock() })).ok).toBe(true);
    const firstPost = calls.findIndex((c) => c.method === "POST");
    expect(calls.slice(0, firstPost).map((c) => `${c.method} ${c.url}`)).toEqual(
      Array(5).fill(`GET ${base}/health`),
    );
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("gives the steps their own timeout after a slow readiness wait", async () => {
    const plan: SmokePlan = {
      ...gated,
      smoke: { via: "proxy", timeoutSeconds: 3, steps: [{ name: "ping", path: "/ping" }] },
    };
    // Three not-ready health answers use up the whole 3s budget; the step still gets its own retries.
    const { fetch, calls } = fakeFetch({
      [`GET ${base}/health`]: [{ status: 503 }, { status: 503 }, { status: 503 }, { status: 200 }],
      [`GET ${base}/ping`]: [{ status: 503 }, { status: 200, body: "ok" }],
    });
    const result = await runSmokePlan(plan, { fetch, ...clock() });
    expect(result.ok).toBe(true);
    expect(calls.filter((c) => c.url.endsWith("/ping"))).toHaveLength(2);
  });

  it("falls through to the first step when the service never answers, so that step reports it", async () => {
    const down = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const { fetch, calls } = fakeFetch({
      [`GET ${base}/health`]: [down],
      [`POST ${base}/records`]: [down],
    });
    const result = await runSmokePlan(gated, { fetch, ...clock() });
    expect(result.ok).toBe(false);
    expect(result.failure).toMatch(/create: POST .* never answered/);
    expect(calls.some((c) => c.method === "POST")).toBe(true);
  });
});

describe("smoke records", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const tmp = () => {
    const d = mkdtempSync(join(tmpdir(), "smoke-record-"));
    dirs.push(d);
    return d;
  };
  const base = PLAN.baseUrl;
  const stepDir = (dir: string, step: string) => join(dir, "orders-api", step);
  const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));

  it("keeps status and body of a passing step, and a last-success copy", async () => {
    const recordDir = tmp();
    const { fetch } = fakeFetch({
      [`POST ${base}/records`]: [{ status: 201, body: '{"id":"a1"}' }],
      [`GET ${base}/records/a1`]: [{ status: 200, body: "smoke" }],
    });
    expect((await runSmokePlan(PLAN, { fetch, recordDir, ...clock() })).ok).toBe(true);
    const dir = stepDir(recordDir, "create");
    expect(json(join(dir, "latest.json"))).toMatchObject({
      service: "orders-api",
      step: "create",
      method: "POST",
      url: `${base}/records`,
      expectedStatus: 201,
      status: 201,
      truncated: false,
    });
    expect(readFileSync(join(dir, "body.txt"), "utf8")).toBe('{"id":"a1"}');
    expect(readFileSync(join(dir, "last-success-body.txt"), "utf8")).toBe('{"id":"a1"}');
    expect(json(join(dir, "last-success.json")).status).toBe(201);
  });

  it("records a failure with the public URL, status and body, and keeps the last success", async () => {
    const recordDir = tmp();
    const ok = fakeFetch({
      [`POST ${base}/records`]: [{ status: 201, body: '{"id":"a1"}' }],
      [`GET ${base}/records/a1`]: [{ status: 200, body: "smoke" }],
    });
    await runSmokePlan(PLAN, { fetch: ok.fetch, recordDir, ...clock() });

    const bad = fakeFetch({
      [`POST ${base}/records`]: [{ status: 201, body: '{"id":"a1"}' }],
      [`GET ${base}/records/a1`]: [{ status: 500, body: "boom" }],
    });
    const result = await runSmokePlan(PLAN, { fetch: bad.fetch, recordDir, ...clock() });
    expect(result.ok).toBe(false);
    const dir = stepDir(recordDir, "read-back");
    expect(result.recordPath).toBe(join(dir, "latest.json"));
    expect(formatSmokeFailure(result)).toContain(`(record: ${join(dir, "latest.json")})`);
    expect(json(join(dir, "latest.json"))).toMatchObject({
      url: `${base}/records/a1`,
      status: 500,
    });
    expect(readFileSync(join(dir, "body.txt"), "utf8")).toBe("boom");
    expect(readFileSync(join(dir, "last-success-body.txt"), "utf8")).toBe("smoke");
    expect(json(join(dir, "last-success.json")).status).toBe(200);
  });

  it("does not count a status match with a missing bodyContains as a success", async () => {
    const recordDir = tmp();
    const { fetch } = fakeFetch({
      [`POST ${base}/records`]: [{ status: 201, body: '{"id":"a1"}' }],
      [`GET ${base}/records/a1`]: [{ status: 200, body: "other" }],
    });
    expect((await runSmokePlan(PLAN, { fetch, recordDir, ...clock() })).ok).toBe(false);
    const dir = stepDir(recordDir, "read-back");
    expect(existsSync(join(dir, "latest.json"))).toBe(true);
    expect(existsSync(join(dir, "last-success.json"))).toBe(false);
  });

  it("caps the body at 64 KiB and marks the record truncated", async () => {
    const recordDir = tmp();
    const plan: SmokePlan = {
      ...PLAN,
      smoke: { via: "proxy", steps: [{ name: "big", path: "/big" }] },
    };
    const { fetch } = fakeFetch({
      [`GET ${base}/big`]: [{ status: 200, body: "x".repeat(SMOKE_RECORD_BODY_MAX_BYTES + 500) }],
    });
    await runSmokePlan(plan, { fetch, recordDir, ...clock() });
    const dir = stepDir(recordDir, "big");
    expect(readFileSync(join(dir, "body.txt")).length).toBe(SMOKE_RECORD_BODY_MAX_BYTES);
    expect(json(join(dir, "latest.json"))).toMatchObject({
      truncated: true,
      bodyBytes: SMOKE_RECORD_BODY_MAX_BYTES,
    });
  });

  it("writes a null status and the error code, and no body file, when nothing answers", async () => {
    const recordDir = tmp();
    const plan: SmokePlan = {
      ...PLAN,
      smoke: { via: "proxy", timeoutSeconds: 1, steps: [{ name: "ping", path: "/ping" }] },
    };
    const refused = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const { fetch } = fakeFetch({ [`GET ${base}/ping`]: [refused] });
    const result = await runSmokePlan(plan, { fetch, recordDir, ...clock() });
    expect(result.ok).toBe(false);
    const dir = stepDir(recordDir, "ping");
    expect(json(join(dir, "latest.json"))).toMatchObject({ status: null, error: "ECONNREFUSED" });
    expect(existsSync(join(dir, "body.txt"))).toBe(false);
  });

  it("keeps a separate record for steps whose names slug the same", async () => {
    const recordDir = tmp();
    const plan: SmokePlan = {
      ...PLAN,
      smoke: {
        via: "proxy",
        steps: [
          { name: "read back", path: "/a" },
          { name: "read-back", path: "/b" },
        ],
      },
    };
    const { fetch } = fakeFetch({
      [`GET ${base}/a`]: [{ status: 200, body: "first" }],
      [`GET ${base}/b`]: [{ status: 200, body: "second" }],
    });
    await runSmokePlan(plan, { fetch, recordDir, ...clock() });
    expect(readFileSync(join(stepDir(recordDir, "read-back"), "body.txt"), "utf8")).toBe("first");
    expect(readFileSync(join(stepDir(recordDir, "read-back-2"), "body.txt"), "utf8")).toBe(
      "second",
    );
  });

  it("writes nothing without a recordDir", async () => {
    const { fetch } = fakeFetch({
      [`POST ${base}/records`]: [{ status: 201, body: '{"id":"a1"}' }],
      [`GET ${base}/records/a1`]: [{ status: 200, body: "smoke" }],
    });
    const result = await runSmokePlan(PLAN, { fetch, ...clock() });
    expect(result.ok).toBe(true);
    expect(result.recordPath).toBeUndefined();
  });
});

describe("readOnlySmokePlans", () => {
  const plan: SmokePlan = {
    name: "reservation-api",
    baseUrl: "http://api.shop.localhost/api/reservation",
    smoke: {
      via: "proxy",
      timeoutSeconds: 60,
      steps: [
        {
          name: "create",
          method: "POST",
          path: "/api/v1/reservations",
          body: { guests: 2 },
          expect: 201,
        },
        { name: "read back", path: "/api/v1/reservations/{{id}}", expect: 200 },
        {
          name: "list",
          method: "get",
          path: "/api/v1/reservations",
          expect: 200,
          bodyContains: "guests",
        },
      ],
    },
  };

  it("keeps only GET steps that need no saved value", () => {
    const [kept] = readOnlySmokePlans([plan]);
    expect(kept.smoke.steps.map((step) => step.name)).toEqual(["list"]);
  });

  it("clears bodyContains so doctor checks the route, not data that earlier writes created", () => {
    const [kept] = readOnlySmokePlans([plan]);
    expect(kept.smoke.steps[0].expect).toBe(200);
    expect(kept.smoke.steps[0].bodyContains).toBeUndefined();
  });

  it("leaves out a service that has no read-only steps", () => {
    const writesOnly: SmokePlan = {
      ...plan,
      smoke: { via: "proxy", steps: [plan.smoke.steps[0]] },
    };
    expect(readOnlySmokePlans([writesOnly])).toEqual([]);
  });

  it("caps the budget so a doctor run does not wait the full up budget", () => {
    const [kept] = readOnlySmokePlans([plan]);
    expect(kept.smoke.timeoutSeconds).toBe(10);
    const [short] = readOnlySmokePlans([{ ...plan, smoke: { ...plan.smoke, timeoutSeconds: 3 } }], {
      timeoutSeconds: 10,
    });
    expect(short.smoke.timeoutSeconds).toBe(3);
  });

  it("drops the ready-poll so doctor does not block on a starting service", () => {
    const [kept] = readOnlySmokePlans([{ ...plan, readyPath: "/health" }]);
    expect(kept.readyPath).toBeUndefined();
  });
});
