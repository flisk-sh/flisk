// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { DATABASE_MANAGEMENT_FEATURE } from "../constants.js";
import { isStackFeatureEnabledInStacks, STACK_FEATURES } from "../stack-features.js";

describe("isStackFeatureEnabledInStacks", () => {
  describe("feature present in STACK_FEATURES", () => {
    it("returns true when enabled in pre_alpha phase", () => {
      expect(
        isStackFeatureEnabledInStacks(
          { pre_alpha: { enabledStacks: [DATABASE_MANAGEMENT_FEATURE] } },
          DATABASE_MANAGEMENT_FEATURE,
        ),
      ).toBe(true);
    });

    it("returns true when enabled in alpha or beta phase", () => {
      expect(
        isStackFeatureEnabledInStacks(
          { alpha: { enabledStacks: [DATABASE_MANAGEMENT_FEATURE] } },
          DATABASE_MANAGEMENT_FEATURE,
        ),
      ).toBe(true);

      expect(
        isStackFeatureEnabledInStacks(
          { beta: { enabledStacks: [DATABASE_MANAGEMENT_FEATURE] } },
          DATABASE_MANAGEMENT_FEATURE,
        ),
      ).toBe(true);
    });

    it("returns true when enabled alongside other stacks in a list", () => {
      expect(
        isStackFeatureEnabledInStacks(
          {
            alpha: {
              enabledStacks: ["other-stack", DATABASE_MANAGEMENT_FEATURE, "monitoring-stack"],
            },
          },
          DATABASE_MANAGEMENT_FEATURE,
        ),
      ).toBe(true);
    });

    it("returns true when one of multiple configured phases enables the feature", () => {
      expect(
        isStackFeatureEnabledInStacks(
          {
            pre_alpha: { enabledStacks: ["unrelated"] },
            alpha: { enabledStacks: [] },
            beta: { enabledStacks: [DATABASE_MANAGEMENT_FEATURE] },
          },
          DATABASE_MANAGEMENT_FEATURE,
        ),
      ).toBe(true);
    });
  });

  describe("feature absent from STACK_FEATURES or stack configuration", () => {
    it("returns false when feature is not defined in STACK_FEATURES even if present in enabledStacks", () => {
      expect(
        isStackFeatureEnabledInStacks(
          { pre_alpha: { enabledStacks: ["unknown-feature"] } },
          "unknown-feature",
        ),
      ).toBe(false);

      expect(
        isStackFeatureEnabledInStacks(
          { alpha: { enabledStacks: ["nonexistent", DATABASE_MANAGEMENT_FEATURE] } },
          "nonexistent",
        ),
      ).toBe(false);
    });

    it("returns false when a known feature is absent from all enabled stack phases", () => {
      expect(
        isStackFeatureEnabledInStacks(
          {
            pre_alpha: { enabledStacks: ["other-stack"] },
            alpha: { enabledStacks: ["different-stack"] },
            beta: { enabledStacks: ["third-stack"] },
          },
          DATABASE_MANAGEMENT_FEATURE,
        ),
      ).toBe(false);
    });

    it("returns false when the feature is only specified in out_of_scope phase", () => {
      expect(
        isStackFeatureEnabledInStacks(
          { out_of_scope: { enabledStacks: [DATABASE_MANAGEMENT_FEATURE] } },
          DATABASE_MANAGEMENT_FEATURE,
        ),
      ).toBe(false);
    });
  });

  describe("empty stack list", () => {
    it("returns false when the stacks configuration is an empty object", () => {
      expect(isStackFeatureEnabledInStacks({}, DATABASE_MANAGEMENT_FEATURE)).toBe(false);
      expect(isStackFeatureEnabledInStacks({}, "unknown-feature")).toBe(false);
    });

    it("returns false when phases have empty enabledStacks lists", () => {
      expect(
        isStackFeatureEnabledInStacks(
          {
            pre_alpha: { enabledStacks: [] },
            alpha: { enabledStacks: [] },
            beta: { enabledStacks: [] },
          },
          DATABASE_MANAGEMENT_FEATURE,
        ),
      ).toBe(false);
    });

    it("returns false when phases have undefined enabledStacks", () => {
      expect(
        isStackFeatureEnabledInStacks(
          { pre_alpha: {}, alpha: {}, beta: {} },
          DATABASE_MANAGEMENT_FEATURE,
        ),
      ).toBe(false);
    });
  });

  describe("STACK_FEATURES constant metadata", () => {
    it("defines database-management with expected schema", () => {
      const feature = STACK_FEATURES[DATABASE_MANAGEMENT_FEATURE];
      expect(feature).toBeDefined();
      expect(feature.name).toBe(DATABASE_MANAGEMENT_FEATURE);
      expect(typeof feature.description).toBe("string");
      expect(feature.description.length).toBeGreaterThan(0);
      expect(Array.isArray(feature.generatedFiles)).toBe(true);
      expect(feature.generatedFiles.length).toBeGreaterThan(0);
    });
  });
});
