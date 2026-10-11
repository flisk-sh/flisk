// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { summarizeSmokeResults } from "../doctor-runtime.js";

describe("summarizeSmokeResults", () => {
  it("skips when no service declares a read-only check", () => {
    const result = summarizeSmokeResults([]);
    expect(result.isSkipped).toBe(true);
    expect(result.didPass).toBe(true);
  });

  it("passes when every service's smoke steps pass", () => {
    const result = summarizeSmokeResults([{ name: "reservation-api", ok: true }]);
    expect(result.didPass).toBe(true);
    expect(result.message).toContain("pass their smoke checks");
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
    expect(result.message).toContain("1/2 passing");
    expect(result.fix).toContain("service.json");
  });
});
