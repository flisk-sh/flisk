// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { findStaleDisabledResources } from "../../doctor-runtime.js";
import * as hub from "../../up-readiness.js";
import * as evaluateModule from "../evaluate.js";
import * as formatModule from "../format.js";
import { formatTail } from "../format.js";
import * as graceModule from "../grace.js";
import {
  DEFAULT_FAILURE_GRACE_MS,
  failureGraceFromEnv,
  trackFailingSince,
  withinFailureGrace,
} from "../grace.js";
import * as waitModule from "../wait.js";
import { waitForTiltResourcesReady } from "../wait.js";

const item = (name: string, updateStatus: string, runtimeStatus: string) => ({
  metadata: { name },
  status: { updateStatus, runtimeStatus },
});
const json = (...items: unknown[]) => JSON.stringify({ items });

describe("evaluateTiltReadiness table (evaluate.ts, no clock)", () => {
  const cases: Array<{
    name: string;
    payload: string;
    options?: { disabledHealth?: Set<string>; expected?: string[] };
    expected: { ready: boolean; settled: boolean; pending: number; failures: string[] };
  }> = [
    {
      name: "building resource is pending and unsettled",
      payload: json(item("api", "pending", "pending")),
      expected: { ready: false, settled: false, pending: 1, failures: [] },
    },
    {
      name: "ready resource settles ready",
      payload: json(item("api", "ok", "ok")),
      expected: { ready: true, settled: true, pending: 0, failures: [] },
    },
    {
      name: "errored resource settles with a failure",
      payload: json(item("api", "ok", "ok"), item("db", "error", "none")),
      expected: { ready: false, settled: true, pending: 0, failures: ["db"] },
    },
    {
      name: "errored advisory typecheck resource does not fail the stack",
      payload: json(item("api", "ok", "ok"), item("floor-app-typecheck", "error", "none")),
      expected: { ready: true, settled: true, pending: 0, failures: [] },
    },
    {
      name: "unhealthy container with disabled health checks counts as ready",
      payload: json(item("api", "ok", "ok"), {
        metadata: { name: "db" },
        status: {
          updateStatus: "ok",
          runtimeStatus: "ok",
          composeResourceInfo: { healthStatus: "unhealthy" },
        },
      }),
      options: { disabledHealth: new Set(["db"]) },
      expected: { ready: true, settled: true, pending: 0, failures: [] },
    },
    {
      name: "expected service Tilt has not listed yet stays pending",
      payload: json(item("postgres", "ok", "ok")),
      options: { expected: ["catalog-api"] },
      expected: { ready: false, settled: false, pending: 1, failures: [] },
    },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const { result, settled } = evaluateModule.evaluateTiltReadiness(
        c.payload,
        new Set(),
        c.options?.expected,
        c.options?.disabledHealth,
      );
      expect(result.ready).toBe(c.expected.ready);
      expect(settled).toBe(c.expected.settled);
      expect(result.pending).toBe(c.expected.pending);
      expect(result.failures.map((f) => f.name)).toEqual(c.expected.failures);
    });
  }
});

describe("failure grace (grace.ts)", () => {
  it("failureGraceFromEnv takes a finite non-negative value and falls back otherwise", () => {
    expect(failureGraceFromEnv("30000")).toBe(30_000);
    expect(failureGraceFromEnv("0")).toBe(0);
    for (const bad of [undefined, "", "120000ms", "-5", "Infinity"]) {
      expect(failureGraceFromEnv(bad)).toBe(DEFAULT_FAILURE_GRACE_MS);
    }
  });

  it("withinFailureGrace covers only runtime failures inside the window", () => {
    const runtime = {
      ready: false,
      failures: [{ name: "db", message: "unhealthy", runtime: true }],
      pending: 0,
      timedOut: false,
      enabled: ["db"],
    };
    const since = new Map([["db", 1_000]]);
    expect(withinFailureGrace(runtime, since, 3_000, 5_000)).toBe(true);
    expect(withinFailureGrace(runtime, since, 6_000, 5_000)).toBe(false);
    const exited = {
      ...runtime,
      failures: [{ name: "db", message: "ok/error" }],
    };
    expect(withinFailureGrace(exited, since, 3_000, 5_000)).toBe(false);
    expect(withinFailureGrace({ ...runtime, failures: [] }, since, 3_000, 5_000)).toBe(false);
  });

  it("trackFailingSince keeps each resource's own start and forgets recovered ones", () => {
    const since = new Map<string, number>();
    trackFailingSince(since, [{ name: "db", message: "x", runtime: true }], 1_000);
    trackFailingSince(
      since,
      [
        { name: "db", message: "x", runtime: true },
        { name: "cache", message: "x", runtime: true },
      ],
      4_000,
    );
    expect(since.get("db")).toBe(1_000);
    expect(since.get("cache")).toBe(4_000);
    trackFailingSince(since, [{ name: "cache", message: "x", runtime: true }], 9_000);
    expect(since.has("db")).toBe(false);
    expect(since.get("cache")).toBe(4_000);
  });
});

describe("formatTail (format.ts, pure)", () => {
  it("trims, drops blank lines and keeps the last lines", () => {
    expect(formatTail("a\n\nb\nc\n", 2)).toBe("b\nc");
    expect(formatTail("  a  \n  b  \n")).toBe("  a\n  b");
    expect(formatTail("")).toBe("");
    const twelve = Array.from({ length: 12 }, (_, i) => `log line ${i + 1}`).join("\n");
    expect(formatTail(twelve)).toBe(
      Array.from({ length: 10 }, (_, i) => `log line ${i + 3}`).join("\n"),
    );
  });
});

describe("waitForTiltResourcesReady with a fake clock (wait.ts)", () => {
  const opts = { intervalMs: 1, deferred: new Set<string>(), failureGraceMs: 0 };

  it("retries a pending resource, then reports ready", async () => {
    let tick = 0;
    const responses = [json(item("api", "pending", "pending")), json(item("api", "ok", "ok"))];
    const result = await waitForTiltResourcesReady(1, {
      ...opts,
      now: () => tick,
      fetchJson: async () => {
        tick += 1_000;
        return responses.shift() ?? null;
      },
    });
    expect(result.ready).toBe(true);
    expect(result.timedOut).toBe(false);
  });

  it("times out with stillBuilding and the tail of the last logs", async () => {
    let tick = 0;
    const logs = Array.from({ length: 12 }, (_, i) => `log line ${i + 1}`).join("\n");
    const result = await waitForTiltResourcesReady(1, {
      ...opts,
      timeoutMs: 30,
      now: () => tick,
      fetchJson: async () => {
        tick += 10;
        return json(item("api", "in_progress", "pending"));
      },
      fetchLogs: async () => logs,
    });
    expect(result).toMatchObject({ ready: false, timedOut: true, stillBuilding: ["api"] });
    expect(result.lastLogs?.api).toContain("log line 12");
    expect(result.lastLogs?.api).not.toContain("log line 1\n");
  });
});

describe("hub re-exports (up-readiness.ts)", () => {
  it("re-exports the same references as the modules", () => {
    expect(hub.waitForTiltResourcesReady).toBe(waitModule.waitForTiltResourcesReady);
    expect(hub.evaluateTiltReadiness).toBe(evaluateModule.evaluateTiltReadiness);
    expect(hub.onlyEnabledResources).toBe(evaluateModule.onlyEnabledResources);
    expect(hub.formatTail).toBe(formatModule.formatTail);
    expect(hub.tiltGetUiResources).toBe(formatModule.tiltGetUiResources);
    expect(hub.DEFAULT_FAILURE_GRACE_MS).toBe(graceModule.DEFAULT_FAILURE_GRACE_MS);
    expect(hub.withinFailureGrace).toBe(graceModule.withinFailureGrace);
    expect(hub.findStaleDisabledResources).toBe(findStaleDisabledResources);
  });
});
