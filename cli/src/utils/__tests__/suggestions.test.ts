// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { suggestClosest } from "../suggestions.js";

describe("suggestClosest", () => {
  it("does not suggest a candidate that already matches exactly", () => {
    expect(suggestClosest("api", ["api", "web"])).toBeUndefined();
  });

  it("recognizes an adjacent transposition as a single edit", () => {
    expect(suggestClosest("aip", ["api", "web"])).toBe("api");
    expect(suggestClosest("pord", ["prod", "other"])).toBe("prod");
  });

  it("returns no suggestion when nothing is close", () => {
    expect(suggestClosest("database", ["api", "web"])).toBeUndefined();
  });

  it("returns no suggestion for an empty candidate list", () => {
    expect(suggestClosest("api", [])).toBeUndefined();
  });

  it("skips empty string candidate entries safely", () => {
    expect(suggestClosest("api", ["", "apii"])).toBe("apii");
  });

  it("suggests the canonical case for a case-only mismatch", () => {
    expect(suggestClosest("API", ["api"])).toBe("api");
    expect(suggestClosest("order-service", ["Order-Service"])).toBe("Order-Service");
  });

  it("prefers closer candidates when multiple candidates match threshold", () => {
    expect(suggestClosest("orders", ["order", "other-service"])).toBe("order");
    expect(suggestClosest("cart", ["carts", "cat"])).toBe("carts");
  });

  it("breaks equal-distance ties by code-unit order", () => {
    expect(suggestClosest("ap", ["app", "api"])).toBe("api");
    expect(suggestClosest("shp", ["shop", "Shop"])).toBe("Shop");
  });

  it("does not guess for one-character or ambiguous short names", () => {
    expect(suggestClosest("a", ["b"])).toBeUndefined();
    expect(suggestClosest("", ["api"])).toBeUndefined();
    expect(suggestClosest("ab", ["api", "web"])).toBeUndefined();
  });

  it("includes the two-edit threshold and rejects one edit beyond it", () => {
    expect(suggestClosest("abcdefg", ["abxyefg"])).toBe("abxyefg");
    expect(suggestClosest("abcdefg", ["abxyzfg"])).toBeUndefined();
  });
});
