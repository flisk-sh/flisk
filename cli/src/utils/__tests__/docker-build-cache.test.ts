// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  checkDockerBuildCache,
  DOCKER_BUILD_CACHE_CHECK,
  DOCKER_BUILD_CACHE_WARN_GIB,
  parseDockerBuildCache,
  parseReclaimedFromPrune,
  parseSizeToBytes,
  pruneDockerBuildCache,
  validateCacheUntil,
} from "../docker-build-cache.js";

const MOCK_DF_ABOVE_THRESHOLD = `
Images\t12\t4.5GB\t1.2GB (26%)
Containers\t4\t0B\t0B
Local Volumes\t2\t150MB\t0B
Build Cache\t780\t11.82GB\t11.82GB (100%)
`.trim();

const MOCK_DF_BELOW_THRESHOLD = `
Images\t12\t4.5GB\t1.2GB (26%)
Containers\t4\t0B\t0B
Local Volumes\t2\t150MB\t0B
Build Cache\t471\t9.19GB\t5.2GB (56%)
`.trim();

const MOCK_DF_EMPTY = `
Images\t0\t0B\t0B
Build Cache\t0\t0B\t0B
`.trim();

describe("parseSizeToBytes", () => {
  it("parses zero bytes", () => {
    expect(parseSizeToBytes("0B")).toBe(0);
    expect(parseSizeToBytes("0 B")).toBe(0);
    expect(parseSizeToBytes("0")).toBe(0);
  });

  it("parses kilobytes, megabytes, gigabytes, and gigabytes with decimals", () => {
    expect(parseSizeToBytes("1024B")).toBe(1024);
    expect(parseSizeToBytes("1KB")).toBe(1024);
    expect(parseSizeToBytes("10MB")).toBe(10 * 1024 ** 2);
    expect(parseSizeToBytes("2.5GB")).toBe(2.5 * 1024 ** 3);
    expect(parseSizeToBytes("11.82GB")).toBe(11.82 * 1024 ** 3);
    expect(parseSizeToBytes("1TB")).toBe(1024 ** 4);
  });

  it("handles malformed strings safely", () => {
    expect(parseSizeToBytes("")).toBe(0);
    expect(parseSizeToBytes("invalid")).toBe(0);
  });
});

describe("parseDockerBuildCache", () => {
  it("parses build cache entry count, total size, and reclaimable size", () => {
    const info = parseDockerBuildCache(MOCK_DF_ABOVE_THRESHOLD);
    expect(info).not.toBeNull();
    expect(info?.entries).toBe(780);
    expect(info?.size).toBe("11.82GB");
    expect(info?.reclaimable).toBe("11.82GB");
    expect(info?.sizeGib).toBeCloseTo(11.82, 1);
  });

  it("parses empty build cache", () => {
    const info = parseDockerBuildCache(MOCK_DF_EMPTY);
    expect(info).not.toBeNull();
    expect(info?.entries).toBe(0);
    expect(info?.size).toBe("0B");
    expect(info?.reclaimable).toBe("0B");
    expect(info?.sizeBytes).toBe(0);
  });

  it("returns null if Build Cache line is missing", () => {
    const info = parseDockerBuildCache("Images\t12\t4.5GB\t1.2GB");
    expect(info).toBeNull();
  });
});

describe("checkDockerBuildCache", () => {
  it("reports failure when Docker CLI is not installed", async () => {
    const result = await checkDockerBuildCache(async () => "", false);
    expect(result.name).toBe(DOCKER_BUILD_CACHE_CHECK);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("Docker CLI not found");
    expect(result.fix).toContain("https://docs.docker.com/get-docker/");
  });

  it("gracefully skips when docker system df command fails", async () => {
    const runner = async () => {
      throw new Error("daemon is not running");
    };
    const result = await checkDockerBuildCache(runner, true);
    expect(result.name).toBe(DOCKER_BUILD_CACHE_CHECK);
    expect(result.didPass).toBe(true);
    expect(result.isSkipped).toBe(true);
    expect(result.message).toContain("Could not read Docker build cache");
  });

  it("passes when build cache is 0 B in 0 entries", async () => {
    const runner = async () => MOCK_DF_EMPTY;
    const result = await checkDockerBuildCache(runner, true);
    expect(result.name).toBe(DOCKER_BUILD_CACHE_CHECK);
    expect(result.didPass).toBe(true);
    expect(result.isWarning).toBeUndefined();
    expect(result.message).toContain("0 B in 0 entries (Docker build cache is empty)");
    expect(result.buildCache).toEqual({
      size: "0B",
      entries: 0,
      reclaimable: "0B",
    });
  });

  it("passes without warning when build cache is below 10 GB threshold", async () => {
    const runner = async () => MOCK_DF_BELOW_THRESHOLD;
    const result = await checkDockerBuildCache(runner, true);
    expect(result.name).toBe(DOCKER_BUILD_CACHE_CHECK);
    expect(result.didPass).toBe(true);
    expect(result.isWarning).toBeUndefined();
    expect(result.message).toContain("9.19GB across 471 entries");
    expect(result.message).toContain("shared across all projects on this machine");
    expect(result.buildCache).toEqual({
      size: "9.19GB",
      entries: 471,
      reclaimable: "5.2GB",
    });
  });

  it("warns when build cache exceeds 10 GB threshold and suggests flisk down --prune-cache", async () => {
    const runner = async () => MOCK_DF_ABOVE_THRESHOLD;
    const result = await checkDockerBuildCache(runner, true);
    expect(result.name).toBe(DOCKER_BUILD_CACHE_CHECK);
    expect(result.didPass).toBe(false);
    expect(result.isWarning).toBe(true);
    expect(result.message).toContain("11.82GB across 780 entries");
    expect(result.message).toContain(`exceeds ${DOCKER_BUILD_CACHE_WARN_GIB} GB threshold`);
    expect(result.fix).toContain("flisk down --prune-cache");
    expect(result.fix).toContain("docker builder prune --filter until=24h");
    expect(result.buildCache).toEqual({
      size: "11.82GB",
      entries: 780,
      reclaimable: "11.82GB",
    });
  });

  it("pins warning threshold at 10 GiB and tests exact boundaries", async () => {
    expect(DOCKER_BUILD_CACHE_WARN_GIB).toBe(10);

    const makeDf = (size: string) => `Build Cache\t100\t${size}\t${size}\n`;

    const justBelow = await checkDockerBuildCache(async () => makeDf("9.99GB"), true);
    expect(justBelow.didPass).toBe(true);
    expect(justBelow.isWarning).toBeUndefined();

    const exactlyTen = await checkDockerBuildCache(async () => makeDf("10.0GB"), true);
    expect(exactlyTen.didPass).toBe(false);
    expect(exactlyTen.isWarning).toBe(true);
  });
});

describe("validateCacheUntil", () => {
  it("accepts valid duration strings", () => {
    expect(validateCacheUntil("24h")).toBe(true);
    expect(validateCacheUntil("7d")).toBe(true);
    expect(validateCacheUntil("168h")).toBe(true);
    expect(validateCacheUntil("30m")).toBe(true);
    expect(validateCacheUntil("2h30m")).toBe(true);
    expect(validateCacheUntil("1h30m10s")).toBe(true);
  });

  it("accepts valid ISO dates", () => {
    expect(validateCacheUntil("2026-10-01")).toBe(true);
    expect(validateCacheUntil("2026-10-01T00:00:00Z")).toBe(true);
  });

  it("rejects malicious or invalid inputs", () => {
    expect(validateCacheUntil("")).toBe(false);
    expect(validateCacheUntil("   ")).toBe(false);
    expect(validateCacheUntil("24h; rm -rf /")).toBe(false);
    expect(validateCacheUntil("24h && echo pwned")).toBe(false);
    expect(validateCacheUntil("-24h")).toBe(false);
    expect(validateCacheUntil("invalid")).toBe(false);
  });
});

describe("parseReclaimedFromPrune", () => {
  it("extracts reclaimed space from docker builder prune output", () => {
    const output = `
ID                                              RECLAIMED       ACCESS  LAST ACCESSED
abc123def456                                    1.2GB           2       2 days ago
Total reclaimed space: 2.6GB
`;
    expect(parseReclaimedFromPrune(output)).toBe("2.6GB");
  });

  it("handles Total: 0B format", () => {
    expect(parseReclaimedFromPrune("Total: 0B")).toBe("0B");
  });

  it("defaults to 0 B when output has no total line", () => {
    expect(parseReclaimedFromPrune("No cached records found")).toBe("0 B");
  });
});

describe("pruneDockerBuildCache", () => {
  it("rejects invalid age filter with FliskError", async () => {
    await expect(pruneDockerBuildCache({ until: "invalid-age" })).rejects.toThrow(
      'Invalid --cache-until format: "invalid-age"',
    );
  });

  it("executes docker builder prune with structured filter arguments", async () => {
    const executed: string[][] = [];
    const runner = async (args: string[]) => {
      executed.push(args);
      return "Total reclaimed space: 2.6GB";
    };

    const result = await pruneDockerBuildCache({ until: "48h", runner });
    expect(executed).toEqual([["builder", "prune", "-f", "--filter", "until=48h"]]);
    expect(result).toEqual({ reclaimed: "2.6GB", until: "48h" });
  });

  it("uses 24h as default until filter", async () => {
    const executed: string[][] = [];
    const runner = async (args: string[]) => {
      executed.push(args);
      return "Total reclaimed space: 0B";
    };

    const result = await pruneDockerBuildCache({ runner });
    expect(executed).toEqual([["builder", "prune", "-f", "--filter", "until=24h"]]);
    expect(result).toEqual({ reclaimed: "0B", until: "24h" });
  });
});
