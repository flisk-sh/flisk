// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  evaluateTiltReadiness,
  isAdvisoryResource,
  waitForTiltResourcesReady,
} from "../up-readiness.js";

const item = (name: string, updateStatus: string, runtimeStatus: string) => ({
  metadata: { name },
  status: { updateStatus, runtimeStatus },
});
const json = (...items: unknown[]) => JSON.stringify({ items });
const opts = { intervalMs: 1, deferred: new Set<string>() };

describe("waitForTiltResourcesReady", () => {
  it("waits for pending resources, then reports ready", async () => {
    const responses = [
      json(item("api", "pending", "pending")),
      json(item("api", "ok", "ok"), item("web", "ok", "not_applicable")),
    ];
    const result = await waitForTiltResourcesReady(1, {
      ...opts,
      fetchJson: async () => responses.shift() ?? null,
    });
    expect(result.ready).toBe(true);
  });
  it("is not ready when everything else settled but one resource errored", async () => {
    const result = await waitForTiltResourcesReady(1, {
      ...opts,
      fetchJson: async () => json(item("api", "ok", "ok"), item("db", "error", "none")),
    });
    expect(result.ready).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.failures.map((f) => f.name)).toEqual(["db"]);
  });
  it("waits while a running container's health check is starting, then fails when it turns unhealthy", async () => {
    const withHealth = (name: string, healthStatus: string) => ({
      metadata: { name },
      status: { updateStatus: "ok", runtimeStatus: "ok", composeResourceInfo: { healthStatus } },
    });
    const responses = [
      json(withHealth("postgres", "starting"), item("api", "ok", "ok")),
      json(withHealth("postgres", "unhealthy"), item("api", "ok", "ok")),
    ];
    const result = await waitForTiltResourcesReady(1, {
      ...opts,
      fetchJson: async () => responses.shift() ?? null,
    });
    expect(responses).toEqual([]);
    expect(result).toMatchObject({ ready: false, timedOut: false });
    expect(result.failures).toEqual([
      { name: "postgres", message: "container is running, but its health check is failing" },
    ]);
  });
  it("ignores deferred resources", async () => {
    const result = await waitForTiltResourcesReady(1, {
      ...opts,
      deferred: new Set(["lazy"]),
      fetchJson: async () => json(item("api", "ok", "ok"), item("lazy", "none", "none")),
    });
    expect(result.ready).toBe(true);
  });
  it("ignores resources Tilt reports as disabled, as in a partial or phased up", async () => {
    const disabled = {
      metadata: { name: "web-run-only" },
      status: { updateStatus: "none", runtimeStatus: "none", disableStatus: { state: "Disabled" } },
    };
    const result = await waitForTiltResourcesReady(1, {
      ...opts,
      fetchJson: async () => json(item("api", "ok", "ok"), disabled),
    });
    expect(result.ready).toBe(true);
  });
  it("treats a serve-only resource (update not_applicable) as built", async () => {
    const result = await waitForTiltResourcesReady(1, {
      ...opts,
      fetchJson: async () => json(item("api", "not_applicable", "ok")),
    });
    expect(result.ready).toBe(true);
  });
  it("reports an expected service that Tilt has disabled instead of filtering it out", async () => {
    const disabled = {
      metadata: { name: "catalog-api" },
      status: { updateStatus: "none", runtimeStatus: "none", disableStatus: { state: "Disabled" } },
    };
    const result = await waitForTiltResourcesReady(1, {
      ...opts,
      expected: ["catalog-api"],
      fetchJson: async () => json(item("postgres", "ok", "ok"), disabled),
    });
    expect(result.ready).toBe(false);
    expect(result.failures).toEqual([{ name: "catalog-api", message: "disabled in Tilt" }]);
  });
  it("is not ready while an expected service is not listed yet", async () => {
    const result = await waitForTiltResourcesReady(1, {
      ...opts,
      timeoutMs: 20,
      expected: ["catalog-api"],
      fetchJson: async () => json(item("postgres", "ok", "ok")),
    });
    expect(result).toMatchObject({ ready: false, timedOut: true });
  });
  it("is ready once every expected service is listed, enabled and running", async () => {
    const result = await waitForTiltResourcesReady(1, {
      ...opts,
      expected: ["catalog-api"],
      fetchJson: async () => json(item("postgres", "ok", "ok"), item("catalog-api", "ok", "ok")),
    });
    expect(result.ready).toBe(true);
  });
  it("keeps a not_applicable resource failed when its runtime status is an error", async () => {
    const result = await waitForTiltResourcesReady(1, {
      ...opts,
      fetchJson: async () =>
        json(item("api", "ok", "ok"), item("worker", "not_applicable", "error")),
    });
    expect(result.ready).toBe(false);
    expect(result.failures.map((f) => f.name)).toEqual(["worker"]);
  });
  it("returns the names Tilt has enabled", async () => {
    const disabled = {
      metadata: { name: "other" },
      status: { updateStatus: "none", runtimeStatus: "none", disableStatus: { state: "Disabled" } },
    };
    const result = await waitForTiltResourcesReady(1, {
      ...opts,
      fetchJson: async () => json(item("api", "ok", "ok"), disabled),
    });
    expect(result.enabled).toEqual(["api"]);
  });
  it("times out while resources stay pending", async () => {
    const result = await waitForTiltResourcesReady(1, {
      ...opts,
      timeoutMs: 20,
      fetchJson: async () => json(item("api", "pending", "pending")),
    });
    expect(result).toMatchObject({ ready: false, timedOut: true, pending: 1 });
  });
});

describe("evaluateTiltReadiness", () => {
  it("gives a single-shot answer for polling callers", () => {
    const building = evaluateTiltReadiness(json(item("api", "pending", "pending")), new Set());
    expect(building.result).toMatchObject({ ready: false, pending: 1 });
    expect(building.settled).toBe(false);
    const done = evaluateTiltReadiness(json(item("api", "ok", "ok")), new Set());
    expect(done.result.ready).toBe(true);
    expect(done.settled).toBe(true);
    const failed = evaluateTiltReadiness(json(item("api", "error", "none")), new Set());
    expect(failed.result.failures.map((f) => f.name)).toEqual(["api"]);
    expect(failed.settled).toBe(true);
  });
});

describe("waitForTiltResourcesReady with a stalled failure", () => {
  const stalled = json(item("postgres", "error", "none"), item("api", "pending", "pending"));

  it("returns the failure at once when everything pending is blocked by it", async () => {
    const started = Date.now();
    const result = await waitForTiltResourcesReady(1, {
      timeoutMs: 60_000,
      intervalMs: 1,
      fetchJson: async () => stalled,
      deferred: new Set(),
      isStalled: () => true,
    });
    expect(result).toMatchObject({ ready: false, timedOut: false });
    expect(result.failures.map((f) => f.name)).toEqual(["postgres"]);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("keeps waiting when the caller says progress is still possible", async () => {
    const result = await waitForTiltResourcesReady(1, {
      timeoutMs: 30,
      intervalMs: 1,
      fetchJson: async () => stalled,
      deferred: new Set(),
      isStalled: () => false,
    });
    expect(result).toMatchObject({ ready: false, timedOut: true });
  });
});

describe("a resource that is building right now", () => {
  // Shape captured from a real Tilt: the Tiltfile resource is ok, `slow` is mid-build.
  const building = json(
    item("(Tiltfile)", "ok", "not_applicable"),
    item("slow", "in_progress", "not_applicable"),
  );

  it("is not ready, and not settled, while it builds", () => {
    const { result, settled } = evaluateTiltReadiness(building, new Set());
    expect(result).toMatchObject({ ready: false, pending: 1 });
    expect(settled).toBe(false);
  });

  it("is ready once it finishes", () => {
    const done = json(
      item("(Tiltfile)", "ok", "not_applicable"),
      item("slow", "ok", "not_applicable"),
    );
    expect(evaluateTiltReadiness(done, new Set()).result).toMatchObject({
      ready: true,
      pending: 0,
    });
  });
});

describe("isAdvisoryResource", () => {
  it("treats the host typecheck resources as advisory", () => {
    expect(isAdvisoryResource("floor-app-typecheck")).toBe(true);
    expect(isAdvisoryResource("floor-app")).toBe(false);
  });
});
