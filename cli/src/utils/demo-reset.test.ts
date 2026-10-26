// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stopDemoStack } from "./demo-reset.js";

describe("stopDemoStack", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "demo-reset-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs down for an existing Flisk project", () => {
    mkdirSync(join(dir, ".flisk"));
    writeFileSync(join(dir, ".flisk", "project.json"), "{}");
    const runDown = vi.fn();

    expect(stopDemoStack(dir, runDown)).toBe(true);
    expect(runDown).toHaveBeenCalledWith(dir);
  });

  it("does nothing when the folder is not a Flisk project", () => {
    const runDown = vi.fn();

    expect(stopDemoStack(dir, runDown)).toBe(false);
    expect(runDown).not.toHaveBeenCalled();
  });
});
