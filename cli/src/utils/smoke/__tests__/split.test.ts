// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeResource } from "../../../test-support/index.js";
import {
  formatSmokeFailure as formatSmokeFailureFromHub,
  runSmokePlan as runSmokePlanFromHub,
  validateSmoke as validateSmokeFromHub,
} from "../../smoke.js";
import { buildSmokePlans, readOnlySmokePlans } from "../plans.js";
import { formatSmokeFailure } from "../report.js";
import { runSmokePlan, runSmokePlans } from "../run.js";
import {
  DEFAULT_SMOKE_TIMEOUT_SECONDS,
  SMOKE_RECORD_BODY_MAX_BYTES,
  type SmokeConfig,
  type SmokePlan,
  validateSmoke,
} from "../schema.js";

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

const PLAN: SmokePlan = {
  name: "orders-api",
  baseUrl: "http://api.shop.localhost/api/orders",
  smoke: SMOKE,
};

type Reply = { status: number; body?: string } | Error;

/** A fake fetch that answers from a queue per "METHOD url". */
function fakeFetch(replies: Record<string, Reply[]>) {
  const fetch = async (url: string, init: { method: string; body?: string }) => {
    const queue = replies[`${init.method} ${url}`];
    const next = queue && queue.length > 1 ? queue.shift() : queue?.[0];
    if (!next) throw new Error(`unexpected request ${init.method} ${url}`);
    if (next instanceof Error) throw next;
    return { status: next.status, text: async () => next.body ?? "" };
  };
  return fetch;
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

describe("smoke split (#4908): schema validation rejects each malformed shape", () => {
  it.each([
    ["not an object", "nope"],
    ["a via other than proxy", { via: "container", steps: [{ path: "/" }] }],
    ["a non-positive timeout", { via: "proxy", timeoutSeconds: 0, steps: [{ path: "/" }] }],
    ["no steps", { via: "proxy", steps: [] }],
    ["a step without a path", { via: "proxy", steps: [{}] }],
    ["a full URL as a path", { via: "proxy", steps: [{ path: "http://x/y" }] }],
    ["a status outside 100-599", { via: "proxy", steps: [{ path: "/", expect: 99 }] }],
    ["a non-string bodyContains", { via: "proxy", steps: [{ path: "/", bodyContains: 7 }] }],
    ["a save path without $.", { via: "proxy", steps: [{ path: "/", save: { id: "id" } }] }],
  ])("%s", (_label, smoke) => {
    expect(validateSmoke(smoke).length).toBeGreaterThan(0);
  });

  it("accepts the documented example", () => {
    expect(validateSmoke(SMOKE)).toEqual([]);
  });
});

describe("smoke split (#4908): plans are data, validated by one parametrized test", () => {
  it("every catalogue plan built from resources passes validateSmoke", () => {
    const plans = buildSmokePlans([
      makeResource("orders-api", "backend", { smoke: SMOKE }),
      makeResource("shop-web", "frontend", { smoke: { ...SMOKE, steps: [{ path: "/" }] } }),
      makeResource("byo", "bring-your-own", { smoke: SMOKE }),
      makeResource("jobs", "worker", { smoke: SMOKE }),
    ]);
    expect(plans.map((p) => p.name)).toEqual(["orders-api", "shop-web", "byo"]);
    for (const plan of plans) {
      expect(validateSmoke(plan.smoke)).toEqual([]);
    }
  });

  it("readOnlySmokePlans keeps only GET steps without saved values and caps the timeout", () => {
    const readOnly = readOnlySmokePlans([PLAN]);
    expect(readOnly).toEqual([]);
    const getOnly: SmokePlan = {
      name: "orders-api",
      baseUrl: "http://api.shop.localhost/api/orders",
      smoke: {
        via: "proxy",
        timeoutSeconds: 60,
        steps: [{ name: "list", path: "/records", expect: 200 }],
      },
    };
    const [only] = readOnlySmokePlans([getOnly]);
    expect(only?.smoke.steps).toHaveLength(1);
    expect(only?.smoke.timeoutSeconds).toBe(10);
    expect(DEFAULT_SMOKE_TIMEOUT_SECONDS).toBe(60);
  });
});

describe("smoke split (#4908): the executor is fake-deps testable end to end", () => {
  it("runs the steps in order, saving a value for a later step", async () => {
    const fetch = fakeFetch({
      "POST http://api.shop.localhost/api/orders/records": [{ status: 201, body: '{"id":7}' }],
      "GET http://api.shop.localhost/api/orders/records/7": [{ status: 200, body: "smoke" }],
    });
    const result = await runSmokePlan(PLAN, { fetch, ...clock() });
    expect(result).toEqual({ name: "orders-api", ok: true });
  });

  it("fails when a URL never answers within its timeout", async () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const fetch = async () => {
      throw refused;
    };
    const result = await runSmokePlan(
      { ...PLAN, smoke: { ...SMOKE, timeoutSeconds: 1, steps: [{ path: "/records" }] } },
      { fetch, ...clock() },
    );
    expect(result.ok).toBe(false);
    expect(result.failure).toContain("never answered");
  });

  it("caps a recorded body at SMOKE_RECORD_BODY_MAX_BYTES", async () => {
    const dir = mkdtempSync(join(tmpdir(), "smoke-split-"));
    try {
      const fetch = fakeFetch({
        "GET http://api.shop.localhost/api/orders/big": [
          { status: 500, body: "x".repeat(200 * 1024) },
        ],
      });
      const result = await runSmokePlan(
        { ...PLAN, smoke: { via: "proxy", steps: [{ name: "big", path: "/big" }] } },
        { fetch, recordDir: dir, ...clock() },
      );
      expect(result.ok).toBe(false);
      expect(result.recordPath).toBeDefined();
      const record = JSON.parse(readFileSync(result.recordPath as string, "utf8")) as {
        truncated: boolean;
        bodyBytes: number;
      };
      expect(record.truncated).toBe(true);
      expect(record.bodyBytes).toBeLessThanOrEqual(SMOKE_RECORD_BODY_MAX_BYTES);
      const body = readFileSync(join(dir, "orders-api", "big", "body.txt"));
      expect(body.length).toBeLessThanOrEqual(SMOKE_RECORD_BODY_MAX_BYTES);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runSmokePlans runs every plan and keeps each result", async () => {
    const fetch = fakeFetch({
      "GET http://api.shop.localhost/api/orders/records": [{ status: 200, body: "smoke" }],
    });
    const results = await runSmokePlans(
      [
        {
          name: "orders-api",
          baseUrl: "http://api.shop.localhost/api/orders",
          smoke: { via: "proxy", steps: [{ path: "/records", bodyContains: "smoke" }] },
        },
      ],
      { fetch, ...clock() },
    );
    expect(results).toEqual([{ name: "orders-api", ok: true }]);
  });

  it("the hub re-exports the same functions as the split modules", () => {
    expect(runSmokePlanFromHub).toBe(runSmokePlan);
    expect(validateSmokeFromHub).toBe(validateSmoke);
    expect(formatSmokeFailureFromHub).toBe(formatSmokeFailure);
  });
});

describe("smoke split (#4908): report is a golden string", () => {
  it("formats a failure with and without a record path", () => {
    expect(
      formatSmokeFailure({ name: "api", ok: false, failure: "api: step 1: GET /x returned 500" }),
    ).toBe("Smoke check failed: api: step 1: GET /x returned 500");
    expect(
      formatSmokeFailure({
        name: "api",
        ok: false,
        failure: "api: step 1: GET /x returned 500",
        recordPath: "/tmp/r/api/step-1/latest.json",
      }),
    ).toBe(
      "Smoke check failed: api: step 1: GET /x returned 500 (record: /tmp/r/api/step-1/latest.json)",
    );
  });
});
