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

  function project(withTiltfile: boolean) {
    mkdirSync(join(dir, ".flisk", ".flisk-out"), { recursive: true });
    writeFileSync(join(dir, ".flisk", "project.json"), "{}");
    if (withTiltfile) writeFileSync(join(dir, ".flisk", ".flisk-out", "Tiltfile"), "");
  }

  it("runs down for an existing Flisk project", async () => {
    project(true);
    const runDown = vi.fn();

    expect(await stopDemoStack(dir, runDown, async () => {})).toBe(true);
    expect(runDown).toHaveBeenCalledWith(dir);
  });

  it("stops the live Tilt before down, so the old stack cannot keep the ports", async () => {
    project(true);
    const order: string[] = [];
    await stopDemoStack(
      dir,
      () => order.push("down"),
      async () => {
        order.push("stop-tilt");
      },
    );
    expect(order).toEqual(["stop-tilt", "down"]);
  });

  it("still stops a Tilt whose Tiltfile is gone, and skips down because there is nothing to run it with", async () => {
    project(false);
    const stopTilt = vi.fn(async () => {});
    const runDown = vi.fn();

    expect(await stopDemoStack(dir, runDown, stopTilt)).toBe(true);
    expect(stopTilt).toHaveBeenCalledWith(join(dir, ".flisk", ".flisk-out", "Tiltfile"));
    expect(runDown).not.toHaveBeenCalled();
  });

  it("does nothing when the folder is not a Flisk project", async () => {
    const runDown = vi.fn();
    const stopTilt = vi.fn(async () => {});

    expect(await stopDemoStack(dir, runDown, stopTilt)).toBe(false);
    expect(runDown).not.toHaveBeenCalled();
    expect(stopTilt).not.toHaveBeenCalled();
  });
});
