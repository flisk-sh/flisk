// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createTempDir } from "../../test-support/temp-project.js";
import { readProjectName, removeStaleProjectVolumes } from "../demo-reset.js";

describe("removeStaleProjectVolumes", () => {
  it("removes only the volumes of this project's Compose projects", () => {
    const remove = vi.fn();
    const removed = removeStaleProjectVolumes("flisk-restaurant-example", {
      list: () => [
        {
          name: "flisk-restaurant-example-database-management_flisk_restaurant_example_postgres_data",
          composeProject: "flisk-restaurant-example-database-management",
        },
        {
          name: "my-shop-database-management_my_shop_postgres_data",
          composeProject: "my-shop-database-management",
        },
        { name: "flisk-restaurant-example-two_x", composeProject: "flisk-restaurant-example-two" },
        { name: "anonymous", composeProject: "" },
      ],
      remove,
    });
    expect(removed).toEqual([
      "flisk-restaurant-example-database-management_flisk_restaurant_example_postgres_data",
      "flisk-restaurant-example-two_x",
    ]);
    expect(remove).not.toHaveBeenCalledWith("my-shop-database-management_my_shop_postgres_data");
  });

  it("skips a volume that is still in use and keeps going", () => {
    const removed = removeStaleProjectVolumes("demo", {
      list: () => [
        { name: "a", composeProject: "demo-db" },
        { name: "b", composeProject: "demo-db" },
      ],
      remove: (name) => {
        if (name === "a") throw new Error("volume is in use");
      },
    });
    expect(removed).toEqual(["b"]);
  });

  it("returns nothing when Docker cannot be listed", () => {
    const removed = removeStaleProjectVolumes("demo", {
      list: () => {
        throw new Error("Cannot connect to the Docker daemon");
      },
      remove: vi.fn(),
    });
    expect(removed).toEqual([]);
  });
});

describe("readProjectName", () => {
  it("reads project.name from .flisk/project.json", () => {
    const dir = createTempDir("demo-name-");
    mkdirSync(join(dir, ".flisk"));
    writeFileSync(
      join(dir, ".flisk", "project.json"),
      JSON.stringify({ project: { name: "flisk-restaurant-example" } }),
    );
    expect(readProjectName(dir)).toBe("flisk-restaurant-example");
  });

  it("returns undefined without a project file", () => {
    expect(readProjectName(createTempDir("demo-none-"))).toBeUndefined();
  });
});
