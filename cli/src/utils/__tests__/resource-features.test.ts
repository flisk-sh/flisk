// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getDefaultFeaturesForResourceType,
  getGeneratorsForResourceType,
  RESOURCE_FEATURES,
} from "../resource-features.js";

describe("resource-features", () => {
  it("documents every feature from RESOURCE_FEATURES in docs/resource-features.md", () => {
    // Resolve docs/resource-features.md relative to this test file
    const docPath = resolve(__dirname, "../../../../docs/resource-features.md");
    const docContent = readFileSync(docPath, "utf-8");

    const featureKeys = Object.keys(RESOURCE_FEATURES);
    expect(featureKeys.length).toBeGreaterThan(0);

    for (const key of featureKeys) {
      // Each feature must be explicitly referenced in the doc
      expect(
        docContent.includes(`\`${key}\``),
        `Feature "${key}" is defined in RESOURCE_FEATURES but missing from docs/resource-features.md`,
      ).toBe(true);
    }
  });

  describe("getDefaultFeaturesForResourceType", () => {
    it("returns frontend generator features by default", () => {
      const frontendDefaults = getDefaultFeaturesForResourceType("frontend");
      expect(frontendDefaults).toEqual(["api-client", "env-config", "api-index"]);
    });

    it("does not enable prisma by default for backend resources", () => {
      const backendDefaults = getDefaultFeaturesForResourceType("backend");
      expect(backendDefaults).not.toContain("prisma");
    });

    it("returns empty array for bring-your-own resources", () => {
      const byoDefaults = getDefaultFeaturesForResourceType("bring-your-own");
      expect(byoDefaults).toEqual([]);
    });
  });

  describe("getGeneratorsForResourceType", () => {
    it("returns all features that apply to frontend", () => {
      const frontendGenerators = getGeneratorsForResourceType("frontend");
      const names = frontendGenerators.map((f) => f.name);
      expect(names).toContain("api-client");
      expect(names).toContain("env-config");
      expect(names).toContain("nginx");
      expect(names).toContain("vite");
    });

    it("returns all features that apply to backend", () => {
      const backendGenerators = getGeneratorsForResourceType("backend");
      const names = backendGenerators.map((f) => f.name);
      expect(names).toContain("prisma");
      expect(names).toContain("env");
      expect(names).toContain("tsconfig");
      expect(names).toContain("dockerfile");
    });
  });
});
