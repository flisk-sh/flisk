// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { createTempProject } from "../../test-support/index.js";
import {
  getEnabledCapabilities,
  isWatchEnabled,
  resolveProjectCapabilities,
} from "../capabilities.js";

describe("optional watch capability", () => {
  it("is on by default", () => {
    expect(isWatchEnabled({})).toBe(true);
    expect(resolveProjectCapabilities({}).watch).toBe(true);
  });

  it("turns off from capabilities.watch in project.json", () => {
    const root = createTempProject({ projectJson: { capabilities: { watch: false } } });

    expect(isWatchEnabled(root)).toBe(false);
    expect(getEnabledCapabilities(root)).not.toContain("watch");
    expect(getEnabledCapabilities(root)).toEqual(expect.arrayContaining(["gateway", "database"]));
  });

  it("stays on when project.json sets it to true", () => {
    const root = createTempProject({ projectJson: { capabilities: { watch: true } } });

    expect(isWatchEnabled(root)).toBe(true);
  });

  it("a flag can only turn watch off, never back on", () => {
    const root = createTempProject({ projectJson: { capabilities: { watch: false } } });

    expect(isWatchEnabled(root, { watch: true })).toBe(false);
    expect(isWatchEnabled({}, { watch: false })).toBe(false);
  });
});
