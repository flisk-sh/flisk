// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stopDemoStack } from "./demo-reset.js";

const none = async (): Promise<string[]> => [];

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

  it("does not run flisk down (a whole Tiltfile evaluation) when the sweep stops everything", async () => {
    project(true);
    const runDown = vi.fn();

    expect(await stopDemoStack(dir, runDown, async () => {}, none)).toBe(true);
    expect(runDown).not.toHaveBeenCalled();
  });

  it("stops the live Tilt before it sweeps containers, so the old stack cannot keep the ports", async () => {
    project(true);
    const order: string[] = [];
    await stopDemoStack(
      dir,
      () => order.push("down"),
      async () => {
        order.push("stop-tilt");
      },
      async () => {
        order.push("sweep");
        return [];
      },
    );
    expect(order).toEqual(["stop-tilt", "sweep"]);
  });

  it("still stops a Tilt whose Tiltfile is gone, and never runs down without one", async () => {
    project(false);
    const stopTilt = vi.fn(async () => {});
    const runDown = vi.fn();

    expect(await stopDemoStack(dir, runDown, stopTilt, none)).toBe(true);
    expect(stopTilt).toHaveBeenCalledWith(join(dir, ".flisk", ".flisk-out", "Tiltfile"));
    expect(runDown).not.toHaveBeenCalled();
  });

  it("does nothing when the folder is not a Flisk project", async () => {
    const runDown = vi.fn();
    const stopTilt = vi.fn(async () => {});

    expect(await stopDemoStack(dir, runDown, stopTilt, none)).toBe(false);
    expect(runDown).not.toHaveBeenCalled();
    expect(stopTilt).not.toHaveBeenCalled();
  });

  it("sweeps the demo folder, which also stops containers an older layout left there (#4124)", async () => {
    project(true);
    const sweep = vi.fn(none);
    await stopDemoStack(dir, vi.fn(), async () => {}, sweep);
    expect(sweep).toHaveBeenCalledWith(dir);
  });

  it("falls back to flisk down when a container will not stop by label, then sweeps again", async () => {
    project(true);
    const order: string[] = [];
    let calls = 0;
    await stopDemoStack(
      dir,
      () => order.push("down"),
      async () => {},
      async () => {
        order.push("sweep");
        calls += 1;
        return calls === 1 ? ["proj"] : [];
      },
    );
    expect(order).toEqual(["sweep", "down", "sweep"]);
  });

  it("fails, and so deletes nothing, when a container will not stop even after down", async () => {
    project(true);
    await expect(
      stopDemoStack(
        dir,
        () => {
          throw new Error("down failed");
        },
        async () => {},
        async () => ["flisk_demo"],
      ),
    ).rejects.toThrow(/flisk_demo/);
  });
});
