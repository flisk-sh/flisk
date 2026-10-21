// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { DATABASE_MANAGEMENT_FEATURE } from "../constants.js";
import { DEFAULT_ALWAYS_ENABLED_INFRA } from "../project-config-defaults.js";
import { getEnabledProjectFeatures, PROJECT_FEATURES } from "../project-features.js";
import { isStackFeatureEnabledInStacks, STACK_FEATURES } from "../stack-features.js";

describe("STACK_FEATURES", () => {
  it("describes the database-management feature", () => {
    const feature = STACK_FEATURES[DATABASE_MANAGEMENT_FEATURE];
    expect(feature.name).toBe(DATABASE_MANAGEMENT_FEATURE);
    expect(feature.description).toContain("PostgreSQL");
    expect(feature.generatedFiles).toContain(
      "services/platform/database-management/docker-compose.yml",
    );
  });
});

describe("isStackFeatureEnabledInStacks", () => {
  it("is false for a feature nobody knows", () => {
    expect(isStackFeatureEnabledInStacks({ pre_alpha: { enabledStacks: ["nope"] } }, "nope")).toBe(
      false,
    );
  });

  it("is true when a pre-alpha phase enables the feature", () => {
    expect(
      isStackFeatureEnabledInStacks(
        { pre_alpha: { enabledStacks: [DATABASE_MANAGEMENT_FEATURE] } },
        DATABASE_MANAGEMENT_FEATURE,
      ),
    ).toBe(true);
  });

  it("is true when an alpha or beta phase enables the feature", () => {
    for (const phase of ["alpha", "beta"] as const) {
      expect(
        isStackFeatureEnabledInStacks(
          { [phase]: { enabledStacks: [DATABASE_MANAGEMENT_FEATURE] } },
          DATABASE_MANAGEMENT_FEATURE,
        ),
      ).toBe(true);
    }
  });

  it("is false when only an out-of-scope phase enables the feature", () => {
    expect(
      isStackFeatureEnabledInStacks(
        { out_of_scope: { enabledStacks: [DATABASE_MANAGEMENT_FEATURE] } },
        DATABASE_MANAGEMENT_FEATURE,
      ),
    ).toBe(false);
  });

  it("is false when no phase mentions the feature", () => {
    expect(isStackFeatureEnabledInStacks({}, DATABASE_MANAGEMENT_FEATURE)).toBe(false);
    expect(
      isStackFeatureEnabledInStacks(
        { pre_alpha: { enabledStacks: [] } },
        DATABASE_MANAGEMENT_FEATURE,
      ),
    ).toBe(false);
  });
});

describe("DEFAULT_ALWAYS_ENABLED_INFRA", () => {
  it("always enables the database management and the proxy", () => {
    expect([...DEFAULT_ALWAYS_ENABLED_INFRA]).toEqual([DATABASE_MANAGEMENT_FEATURE, "proxy"]);
  });

  it("names features the project layer knows about", () => {
    for (const name of DEFAULT_ALWAYS_ENABLED_INFRA) {
      expect(PROJECT_FEATURES[name], name).toBeDefined();
    }
  });
});

describe("PROJECT_FEATURES", () => {
  it("keys every feature by its own name", () => {
    for (const [key, feature] of Object.entries(PROJECT_FEATURES)) {
      expect(feature.name, key).toBe(key);
    }
  });

  it("gives every feature a description, a category and a phase", () => {
    for (const [key, feature] of Object.entries(PROJECT_FEATURES)) {
      expect(feature.description.length, key).toBeGreaterThan(0);
      expect(["core", "optional", "premium"], key).toContain(feature.category);
      expect(["pre_alpha", "alpha", "beta"], key).toContain(feature.phase);
      expect(typeof feature.enabled_by_default, key).toBe("boolean");
    }
  });

  it("only depends on features that exist", () => {
    for (const [key, feature] of Object.entries(PROJECT_FEATURES)) {
      for (const dependency of feature.dependsOn ?? []) {
        expect(PROJECT_FEATURES[dependency], `${key} depends on ${dependency}`).toBeDefined();
      }
    }
  });

  it("enables the core infrastructure by default and keeps the premium off", () => {
    expect(PROJECT_FEATURES.proxy.enabled_by_default).toBe(true);
    expect(PROJECT_FEATURES[DATABASE_MANAGEMENT_FEATURE].enabled_by_default).toBe(true);
    expect(PROJECT_FEATURES.verdaccio.enabled_by_default).toBe(false);
    expect(PROJECT_FEATURES.verdaccio.category).toBe("premium");
  });
});

describe("getEnabledProjectFeatures", () => {
  it("returns the features that are on by default", () => {
    const enabled = getEnabledProjectFeatures();
    expect(enabled).toContain("proxy");
    expect(enabled).toContain(DATABASE_MANAGEMENT_FEATURE);
    expect(enabled).toContain("golden-image");
    expect(enabled).not.toContain("verdaccio");
    expect(enabled).not.toContain("monitoring");
  });

  it("adds an optional feature that is switched on", () => {
    const enabled = getEnabledProjectFeatures({ monitoring: true });
    expect(enabled).toContain("monitoring");
    expect(enabled).toContain("proxy");
  });

  it("ignores an optional feature that is switched off", () => {
    expect(getEnabledProjectFeatures({ monitoring: false })).not.toContain("monitoring");
  });

  it("ignores a name that is not a feature", () => {
    expect(getEnabledProjectFeatures({ "not-a-feature": true })).not.toContain("not-a-feature");
  });
});
