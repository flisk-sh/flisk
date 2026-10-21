// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { summarizeServiceProbes } from "../doctor-runtime.js";
import type { HealthProbe } from "../service-urls.js";

const base = { appType: "backend" as const, url: "http://api.shop.localhost/api/orders/health" };
const answered = (name: string, status: number): HealthProbe => ({
  ...base,
  name,
  ok: status >= 200 && status < 300,
  status,
});
const refused = (name: string): HealthProbe => ({
  ...base,
  name,
  ok: false,
  error: "fetch failed",
});

describe("summarizeServiceProbes", () => {
  it("skips when every probe failed to connect (stack down or Traefik not bound)", () => {
    const result = summarizeServiceProbes([refused("orders-api"), refused("users-api")]);
    expect(result.isSkipped).toBe(true);
    expect(result.didPass).toBe(true);
    expect(result.message).toContain("No services responded");
  });

  it("fails, not skips, when the only service gets a 404 from Traefik", () => {
    // The case doctor missed: ingress is up and answering, but has no route.
    const result = summarizeServiceProbes([answered("orders-api", 404)]);
    expect(result.isSkipped).toBeUndefined();
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("orders-api");
    expect(result.message).toContain("HTTP 404");
    expect(result.message).toContain("no route");
    expect(result.fix).toContain("re-run `flisk doctor`");
  });

  it("fails on 502/503/504 and explains the container isn't answering", () => {
    for (const status of [502, 503, 504]) {
      const result = summarizeServiceProbes([answered("orders-api", status)]);
      expect(result.didPass).toBe(false);
      expect(result.message).toContain(`HTTP ${status}`);
      expect(result.message).toContain("container isn't answering");
    }
  });

  it("fails and counts healthy services when only some are healthy", () => {
    const result = summarizeServiceProbes([
      answered("orders-api", 200),
      answered("users-api", 404),
      refused("billing-api"),
    ]);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("2 services not healthy (1/3 healthy)");
    expect(result.message).toContain("users-api");
    expect(result.message).toContain("billing-api");
  });

  it("passes when every service answers 2xx", () => {
    const result = summarizeServiceProbes([
      answered("orders-api", 200),
      answered("users-api", 204),
    ]);
    expect(result.didPass).toBe(true);
    expect(result.isSkipped).toBeUndefined();
    expect(result.message).toContain("All 2 services responding");
  });
});
