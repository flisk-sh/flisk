// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { collectLeftovers, formatLeftovers } from "../down-leftovers.js";

const GIB = 1024 ** 3;

const docker =
  (images: Record<string, number>, cache = "Build Cache\t80\t23.4GB\t20GB (85%)\n") =>
  async (args: string[]): Promise<string> => {
    if (args[0] === "image" && args[1] === "inspect") {
      return args
        .slice(4)
        .map((ref) => String(images[ref] ?? 0))
        .join("\n");
    }
    if (args[0] === "system" && args[1] === "df") return cache;
    throw new Error(`unexpected docker ${args.join(" ")}`);
  };

describe("collectLeftovers (cycle 4)", () => {
  it("adds up the project's images and reads the shared build cache", async () => {
    const left = await collectLeftovers(
      ["shop_api:latest", "shop_web:latest"],
      docker({ "shop_api:latest": 1.5 * GIB, "shop_web:latest": 0.5 * GIB }),
    );
    expect(left?.imageCount).toBe(2);
    expect(left?.imageGib).toBeCloseTo(2, 5);
    // Docker prints decimal GB (#3772 parses it as such), the report shows GiB.
    expect(left?.cacheGib).toBeCloseTo((23.4 * 1e9) / GIB, 3);
  });

  it("returns null when Docker cannot be asked", async () => {
    const left = await collectLeftovers(["a:latest"], async () => {
      throw new Error("daemon down");
    });
    expect(left).toBeNull();
  });
});

describe("formatLeftovers (cycle 4)", () => {
  it("tells what is still held and the commands that free it", () => {
    const lines = formatLeftovers({ imageCount: 9, imageGib: 11.2, cacheGib: 23.4 }, "shop");
    const text = lines.join("\n");
    expect(text).toContain("11.2 GiB");
    expect(text).toContain("9 images");
    expect(text).toContain("23.4 GiB");
    expect(text).toContain("flisk down --purge");
    expect(text).toContain("docker builder prune -f");
  });

  it("stays silent when nothing notable is held", () => {
    expect(formatLeftovers({ imageCount: 0, imageGib: 0, cacheGib: 0.05 }, "shop")).toEqual([]);
  });
});
