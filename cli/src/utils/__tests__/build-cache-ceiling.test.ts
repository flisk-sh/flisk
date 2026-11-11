// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BUILD_CACHE_CEILING_ENV,
  BUILD_CACHE_CHECK_INTERVAL_MS,
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
  // These calls use the default home; keep the throttle stamp out of the real ~/.flisk.
  let tempHome = "";
  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), "flisk-bcc-home-"));
  });
  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true });
  });

  it("defaults to 20 GiB and can be changed or switched off with the environment", () => {
    expect(DEFAULT_BUILD_CACHE_CEILING_GIB).toBe(20);
    expect(resolveBuildCacheCeilingGib({})).toBe(20);
    expect(resolveBuildCacheCeilingGib({ [BUILD_CACHE_CEILING_ENV]: "8" })).toBe(8);
    expect(resolveBuildCacheCeilingGib({ [BUILD_CACHE_CEILING_ENV]: "0" })).toBe(0);
    expect(resolveBuildCacheCeilingGib({ [BUILD_CACHE_CEILING_ENV]: "junk" })).toBe(20);
  });

  it("prunes down to the ceiling when the cache is above it", async () => {
    const { calls, run } = recorder("23.4GB");
    const result = await enforceBuildCacheCeiling(run, {}, { home: tempHome });
    expect(result).toMatchObject({ pruned: true, ceilingGib: 20 });
    const prune = calls.find((args) => args[0] === "builder");
    expect(prune).toEqual(["builder", "prune", "-f", "--keep-storage", String(20 * 1024 ** 3)]);
  });

  it("does nothing when the cache is under the ceiling", async () => {
    const { calls, run } = recorder("12GB");
    expect(await enforceBuildCacheCeiling(run, {}, { home: tempHome })).toMatchObject({
      pruned: false,
    });
    expect(calls.some((args) => args[0] === "builder")).toBe(false);
  });

  it("does nothing when the ceiling is 0 (off) or Docker cannot be asked", async () => {
    const off = recorder("90GB");
    expect(
      await enforceBuildCacheCeiling(
        off.run,
        { [BUILD_CACHE_CEILING_ENV]: "0" },
        { home: tempHome },
      ),
    ).toMatchObject({
      pruned: false,
    });
    expect(off.calls).toEqual([]);
    const broken = await enforceBuildCacheCeiling(
      async () => {
        throw new Error("down");
      },
      {},
      { home: tempHome },
    );
    expect(broken).toMatchObject({ pruned: false });
  });
});

describe("build cache ceiling throttle (#3860)", () => {
  const homes: string[] = [];
  const newHome = () => {
    const home = mkdtempSync(join(tmpdir(), "flisk-bcc-"));
    homes.push(home);
    return home;
  };
  afterEach(() => {
    for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
  });

  it("skips docker system df when a recent check found the cache far below the ceiling", async () => {
    const home = newHome();
    const first = recorder("5GB");
    await enforceBuildCacheCeiling(first.run, {}, { home, now: () => 1_000 });
    expect(first.calls).toHaveLength(1);
    const second = recorder("5GB");
    const result = await enforceBuildCacheCeiling(second.run, {}, { home, now: () => 2_000 });
    expect(second.calls).toEqual([]);
    expect(result).toMatchObject({ pruned: false, skipped: true });
  });

  it("checks again once the interval has passed", async () => {
    const home = newHome();
    await enforceBuildCacheCeiling(recorder("5GB").run, {}, { home, now: () => 1_000 });
    const later = recorder("5GB");
    await enforceBuildCacheCeiling(
      later.run,
      {},
      { home, now: () => 1_000 + BUILD_CACHE_CHECK_INTERVAL_MS },
    );
    expect(later.calls).toHaveLength(1);
  });

  it("checks every time when the last size was near the ceiling, and still prunes above it", async () => {
    const home = newHome();
    await enforceBuildCacheCeiling(recorder("19GB").run, {}, { home, now: () => 1_000 });
    const near = recorder("23.4GB");
    const result = await enforceBuildCacheCeiling(near.run, {}, { home, now: () => 2_000 });
    expect(near.calls.some((args) => args[0] === "system")).toBe(true);
    expect(result).toMatchObject({ pruned: true });
    const after = recorder("23.4GB");
    await enforceBuildCacheCeiling(after.run, {}, { home, now: () => 3_000 });
    expect(after.calls.some((args) => args[0] === "system")).toBe(true);
  });

  it("ignores a corrupt stamp", async () => {
    const home = newHome();
    mkdirSync(join(home, ".flisk"), { recursive: true });
    writeFileSync(join(home, ".flisk", "build-cache-check.json"), "{nope");
    const r = recorder("5GB");
    await enforceBuildCacheCeiling(r.run, {}, { home, now: () => 1_000 });
    expect(r.calls).toHaveLength(1);
  });
});
