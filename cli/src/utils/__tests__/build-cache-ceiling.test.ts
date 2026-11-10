// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  BUILD_CACHE_CEILING_ENV,
  DEFAULT_BUILD_CACHE_CEILING_GIB,
  enforceBuildCacheCeiling,
  resolveBuildCacheCeilingGib,
} from "../docker-build-cache.js";

const recorder = (cacheSize: string) => {
  const calls: string[][] = [];
  const run = async (args: string[]): Promise<string> => {
    calls.push(args);
    if (args[0] === "system") return `Build Cache\t80\t${cacheSize}\t5GB (20%)\n`;
    return "Total:\t1GB\n";
  };
  return { calls, run };
};

describe("build cache ceiling (cycle 5)", () => {
  it("defaults to 20 GiB and can be changed or switched off with the environment", () => {
    expect(DEFAULT_BUILD_CACHE_CEILING_GIB).toBe(20);
    expect(resolveBuildCacheCeilingGib({})).toBe(20);
    expect(resolveBuildCacheCeilingGib({ [BUILD_CACHE_CEILING_ENV]: "8" })).toBe(8);
    expect(resolveBuildCacheCeilingGib({ [BUILD_CACHE_CEILING_ENV]: "0" })).toBe(0);
    expect(resolveBuildCacheCeilingGib({ [BUILD_CACHE_CEILING_ENV]: "junk" })).toBe(20);
  });

  it("prunes down to the ceiling when the cache is above it", async () => {
    const { calls, run } = recorder("23.4GB");
    const result = await enforceBuildCacheCeiling(run, {});
    expect(result).toMatchObject({ pruned: true, ceilingGib: 20 });
    const prune = calls.find((args) => args[0] === "builder");
    expect(prune).toEqual(["builder", "prune", "-f", "--keep-storage", String(20 * 1024 ** 3)]);
  });

  it("does nothing when the cache is under the ceiling", async () => {
    const { calls, run } = recorder("12GB");
    expect(await enforceBuildCacheCeiling(run, {})).toMatchObject({ pruned: false });
    expect(calls.some((args) => args[0] === "builder")).toBe(false);
  });

  it("does nothing when the ceiling is 0 (off) or Docker cannot be asked", async () => {
    const off = recorder("90GB");
    expect(
      await enforceBuildCacheCeiling(off.run, { [BUILD_CACHE_CEILING_ENV]: "0" }),
    ).toMatchObject({
      pruned: false,
    });
    expect(off.calls).toEqual([]);
    const broken = await enforceBuildCacheCeiling(async () => {
      throw new Error("down");
    }, {});
    expect(broken).toMatchObject({ pruned: false });
  });
});
