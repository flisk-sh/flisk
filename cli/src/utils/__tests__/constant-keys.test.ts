// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { BRING_YOUR_OWN_TYPE, DATABASE_MANAGEMENT_FEATURE } from "../constants.js";
import { PROJECT_FEATURES } from "../project-features.js";
import { STACK_FEATURES } from "../stack-features.js";

// Guards against `CONST: {...}` in an object literal, which keys the entry by the
// identifier's name instead of its value and silently drops the feature.
describe("constant-keyed feature registries", () => {
  it("keys the database-management entries by the constant's value", () => {
    expect(DATABASE_MANAGEMENT_FEATURE).toBe("database-management");
    expect(PROJECT_FEATURES["database-management"]?.name).toBe("database-management");
    expect(STACK_FEATURES["database-management"]?.name).toBe("database-management");
    expect(PROJECT_FEATURES.DATABASE_MANAGEMENT_FEATURE).toBeUndefined();
    expect(STACK_FEATURES.DATABASE_MANAGEMENT_FEATURE).toBeUndefined();
  });

  it("keeps the bring-your-own constant equal to its resource type id", () => {
    expect(BRING_YOUR_OWN_TYPE).toBe("bring-your-own");
  });

  it.each([
    ["PROJECT_FEATURES", PROJECT_FEATURES],
    ["STACK_FEATURES", STACK_FEATURES],
  ])("keys every %s entry by its own name", (_label, registry) => {
    for (const [key, feature] of Object.entries(registry)) {
      expect(feature?.name).toBe(key);
    }
  });
});
