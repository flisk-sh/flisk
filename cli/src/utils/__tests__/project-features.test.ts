// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { getEnabledProjectFeatures, PROJECT_FEATURES } from "../project-features.js";

const ALL_FEATURES = Object.keys(PROJECT_FEATURES);
const DEFAULT_FEATURES = ALL_FEATURES.filter((key) => PROJECT_FEATURES[key].enabled_by_default);

describe("getEnabledProjectFeatures", () => {
  it("returns only the default features for an empty config", () => {
    expect(getEnabledProjectFeatures({})).toEqual(DEFAULT_FEATURES);
    expect(getEnabledProjectFeatures()).toEqual(DEFAULT_FEATURES);
  });

  it("adds one switched-on feature in PROJECT_FEATURES order", () => {
    const enabled = getEnabledProjectFeatures({ monitoring: true });
    expect(enabled).toEqual(
      ALL_FEATURES.filter(
        (key) => key === "monitoring" || PROJECT_FEATURES[key].enabled_by_default,
      ),
    );
  });

  it("returns every feature exactly once, in PROJECT_FEATURES order, when all are on", () => {
    const all = Object.fromEntries(ALL_FEATURES.map((key) => [key, true]));
    expect(getEnabledProjectFeatures(all)).toEqual(ALL_FEATURES);
  });

  it("keeps PROJECT_FEATURES order regardless of the config's key order", () => {
    const reversed = Object.fromEntries([...ALL_FEATURES].reverse().map((key) => [key, true]));
    expect(getEnabledProjectFeatures(reversed)).toEqual(ALL_FEATURES);
  });

  it("does not let false switch off a default feature", () => {
    const off = Object.fromEntries(DEFAULT_FEATURES.map((key) => [key, false]));
    expect(getEnabledProjectFeatures(off)).toEqual(DEFAULT_FEATURES);
  });

  it("ignores names that are not features", () => {
    expect(getEnabledProjectFeatures({ "not-a-feature": true })).toEqual(DEFAULT_FEATURES);
  });
});
