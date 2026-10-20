// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { summarizeSmokeResults } from "../doctor-runtime.js";
import { readOnlySmokePlans, type SmokePlan } from "../smoke.js";

describe("summarizeSmokeResults", () => {
  it("skips when no service declares a read-only check", () => {
    const result = summarizeSmokeResults([]);
    expect(result.isSkipped).toBe(true);
    expect(result.didPass).toBe(true);
    expect(result.message).toBe("No read-only smoke checks declared");
  });

  it("passes when every service's smoke steps pass", () => {
    const single = summarizeSmokeResults([{ name: "reservation-api", ok: true }]);
    expect(single.didPass).toBe(true);
    expect(single.message).toBe("All 1 service pass their smoke checks");

    const multiple = summarizeSmokeResults([
      { name: "reservation-api", ok: true },
      { name: "menu-api", ok: true },
    ]);
    expect(multiple.didPass).toBe(true);
    expect(multiple.message).toBe("All 2 services pass their smoke checks");
  });

  it("fails and names the service and the step that did not answer as expected", () => {
    const result = summarizeSmokeResults([
      {
        name: "reservation-api",
        ok: false,
        failure: "reservation-api: list: expected 200, got 404",
      },
      { name: "menu-api", ok: true },
    ]);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("reservation-api: list: expected 200, got 404");
    expect(result.message).toContain("1 service failing a smoke check (1/2 passing):");
    expect(result.fix).toContain("service.json");
    expect(result.fix).toContain('service.json "smoke" block. Then re-run tdk doctor.');
  });

  it("falls back to default failure text when failure details are absent", () => {
    const result = summarizeSmokeResults([
      { name: "auth-api", ok: false },
      { name: "billing-api", ok: false, failure: "billing-api: timeout" },
    ]);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("auth-api: failed");
    expect(result.message).toContain("billing-api: timeout");
    expect(result.message).toContain("2 services failing a smoke check (0/2 passing):");
  });
});

describe("readOnlySmokePlans", () => {
  const basePlan = (steps: SmokePlan["smoke"]["steps"], timeout = 30): SmokePlan => ({
    name: "users-api",
    baseUrl: "http://users.tdk.local:8080",
    smoke: {
      via: "proxy",
      timeoutSeconds: timeout,
      steps,
    },
  });

  it("keeps only GET steps and drops steps with a body or template placeholders", () => {
    const plan = basePlan([
      { path: "/users", method: "GET", expect: 200, bodyContains: "list" },
      { path: "/users", method: "POST", body: '{"name":"alex"}', expect: 201 },
      { path: "/users/{{userId}}", method: "GET", expect: 200 },
      { path: "/health", expect: 200 }, // defaults to GET when method omitted
      { path: "/users/1", method: "DELETE", expect: 204 },
    ]);

    const filtered = readOnlySmokePlans([plan]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.smoke.steps).toEqual([
      { path: "/users", method: "GET", expect: 200, bodyContains: undefined },
      { path: "/health", expect: 200, bodyContains: undefined },
    ]);
  });

  it("caps timeoutSeconds to the doctor smoke budget", () => {
    const longTimeout = basePlan([{ path: "/ping" }], 60);
    const capped = readOnlySmokePlans([longTimeout], { timeoutSeconds: 5 });
    expect(capped[0]?.smoke.timeoutSeconds).toBe(5);

    const shortTimeout = basePlan([{ path: "/ping" }], 3);
    const kept = readOnlySmokePlans([shortTimeout], { timeoutSeconds: 10 });
    expect(kept[0]?.smoke.timeoutSeconds).toBe(3);
  });

  it("drops plans whose steps are all non-GET or require template state", () => {
    const writeOnlyPlan = basePlan([
      { path: "/create", method: "POST", body: "{}" },
      { path: "/items/{{id}}", method: "GET" },
    ]);
    expect(readOnlySmokePlans([writeOnlyPlan])).toEqual([]);
  });

  it("preserves name and baseUrl on the returned plan", () => {
    const plan = basePlan([{ path: "/api/status" }]);
    const [result] = readOnlySmokePlans([plan]);
    expect(result?.name).toBe("users-api");
    expect(result?.baseUrl).toBe("http://users.tdk.local:8080");
  });
});
