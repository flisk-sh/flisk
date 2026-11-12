// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { pruneSupersededTiltImages, selectSupersededTiltImages } from "../tilt-images.js";

const ROWS = [
  "shop_api\ttilt-old\t2026-11-11 10:00:00 +0200 EET\t184MB",
  "shop_api\ttilt-new\t2026-11-12 10:00:00 +0200 EET\t184MB",
  "shop_api\ttilt-mid\t2026-11-11 22:00:00 +0200 EET\t184MB",
  "shop_api\tdev\t2026-11-12 10:00:00 +0200 EET\t184MB",
  "shop_migrator\ttilt-a\t2026-11-12 09:00:00 +0200 EET\t791MB",
  "postgres\t16\t2026-11-01 09:00:00 +0200 EET\t692MB",
].join("\n");

describe("selectSupersededTiltImages", () => {
  it("keeps the newest N tilt tags per repository and ignores other tags", () => {
    const { remove, kept } = selectSupersededTiltImages(ROWS, 1);
    expect(remove.map((i) => i.tag).sort()).toEqual(["tilt-mid", "tilt-old"]);
    expect(kept.map((i) => `${i.repo}:${i.tag}`).sort()).toEqual([
      "shop_api:tilt-new",
      "shop_migrator:tilt-a",
    ]);
  });
});

describe("pruneSupersededTiltImages", () => {
  it("untags old builds, counts their size, and keeps images a container still uses", async () => {
    const calls: string[][] = [];
    const run = async (args: string[]) => {
      calls.push(args);
      if (args[0] === "image") return ROWS;
      if (args[1] === "shop_api:tilt-mid") throw new Error("image is being used by container");
      return "";
    };
    const res = await pruneSupersededTiltImages(1, run);
    expect(res.removed).toEqual(["shop_api:tilt-old"]);
    expect(res.kept).toContain("shop_api:tilt-mid");
    expect(res.removedBytes).toBe(184_000_000);
    expect(calls.filter((c) => c[0] === "rmi")).toHaveLength(2);
  });

  it("returns an empty result when Docker cannot be asked", async () => {
    const res = await pruneSupersededTiltImages(1, async () => {
      throw new Error("daemon down");
    });
    expect(res).toEqual({ removed: [], kept: [], removedBytes: 0 });
  });
});
