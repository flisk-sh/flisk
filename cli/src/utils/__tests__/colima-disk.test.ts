// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import type { ColimaStatus } from "../colima.js";
import {
  type ColimaDiskDeps,
  checkColimaDisk,
  isColimaDiskBloated,
  sumDockerUsageBytes,
  trimColimaAndMeasure,
} from "../colima-disk.js";

const GIB = 1024 ** 3;
const running: ColimaStatus = { isColima: true, running: true };

const DF = [
  "Images\t12\t4GB\t1GB (25%)",
  "Containers\t3\t0B\t0B (0%)",
  "Local Volumes\t2\t1GB\t0B (0%)",
  "Build Cache\t40\t5GB\t5GB",
].join("\n");

function deps(over: Partial<ColimaDiskDeps> = {}): ColimaDiskDeps {
  return {
    diskFileBytes: () => 34 * GIB,
    dockerDf: async () => DF,
    colimaStatus: () => running,
    ...over,
  };
}

describe("colima disk", () => {
  it("sums every row of docker system df", () => {
    expect(sumDockerUsageBytes(DF)).toBe(10 * 1000 ** 3);
  });

  it("warns when the disk file holds more than 3x what Docker reports", async () => {
    const result = await checkColimaDisk(deps());
    expect(result.isWarning).toBe(true);
    expect(result.didPass).toBe(false);
    expect(result.fix).toContain("flisk doctor --fix");
    expect(result.colimaDisk?.diskFileBytes).toBe(34 * GIB);
    expect(result.colimaDisk?.dockerBytes).toBe(10 * 1000 ** 3);
    expect(result.colimaDisk?.ratio).toBeGreaterThan(3);
  });

  it("passes and reports both sizes when the disk file is close to Docker's usage", async () => {
    const result = await checkColimaDisk(deps({ diskFileBytes: () => 12 * GIB }));
    expect(result.didPass).toBe(true);
    expect(result.isWarning).toBeUndefined();
    expect(result.colimaDisk).toBeDefined();
  });

  it("does not warn about a small VM, even at a high ratio", () => {
    expect(isColimaDiskBloated({ diskFileBytes: 3 * GIB, dockerBytes: GIB / 4, ratio: 12 })).toBe(
      false,
    );
  });

  it("skips when Docker is not on a running Colima VM", async () => {
    const off = await checkColimaDisk(
      deps({ colimaStatus: () => ({ isColima: false, running: true }) }),
    );
    expect(off.isSkipped).toBe(true);
    const missing = await checkColimaDisk(deps({ diskFileBytes: () => null }));
    expect(missing.isSkipped).toBe(true);
  });

  it("trims with the runner and reports the host space returned", async () => {
    const sizes = [34 * GIB, 12 * GIB];
    let trims = 0;
    const result = await trimColimaAndMeasure({
      status: running,
      diskFileBytes: () => sizes.shift() ?? null,
      trim: async () => {
        trims++;
      },
    });
    expect(trims).toBe(1);
    expect(result?.returnedBytes).toBe(22 * GIB);
  });

  it("does not run the trim when Docker is not on a Colima VM", async () => {
    let trims = 0;
    const result = await trimColimaAndMeasure({
      status: { isColima: false, running: true },
      trim: async () => {
        trims++;
      },
    });
    expect(result).toBeNull();
    expect(trims).toBe(0);
  });
});
