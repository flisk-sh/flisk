// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import type { DiscoveredResource, ResourceConfig } from "../../types/index.js";
import {
  coldStartNotice,
  countBuiltImages,
  formatColdStartNotice,
  isColdStart,
  projectImageFilters,
} from "../cold-start.js";

function service(
  name: string,
  config: Partial<ResourceConfig> = {},
  stack = "voting",
): DiscoveredResource {
  return {
    name,
    path: `/project/${name}`,
    configPath: `/project/${name}/service.json`,
    stack,
    config: { appName: name, appType: "backend", ...config } as ResourceConfig,
  };
}

const services = [
  service("api"),
  service("web", { appType: "frontend" }),
  service("worker", { appType: "worker" }),
];

describe("coldStartNotice", () => {
  it("prints the first-start line when none of the project's images exist (cold start)", async () => {
    const run = vi.fn(async () => "");

    const notice = await coldStartNotice("my-app", services, run);

    expect(notice).toBe(
      "First start: building 3 images from scratch. This takes a few minutes; later starts reuse the cache.",
    );
    expect(run).toHaveBeenCalledWith([
      "images",
      "-q",
      "--filter",
      "reference=my_app_voting_*",
      "--filter",
      "reference=my_app_voting-db-migrator",
    ]);
  });

  it("prints nothing when the project's images already exist (warm start)", async () => {
    const run = vi.fn(async () => "3f1c2a9b8e7d\n9a8b7c6d5e4f\n");

    expect(await coldStartNotice("my-app", services, run)).toBeNull();
  });

  it("prints nothing when Docker cannot be asked", async () => {
    const run = vi.fn(async () => {
      throw new Error("Cannot connect to the Docker daemon");
    });

    expect(await coldStartNotice("my-app", services, run)).toBeNull();
  });

  it("does not ask Docker when the run builds no image", async () => {
    const run = vi.fn(async () => "");
    const nothingToBuild = [
      service("shared", { appType: "library" }),
      service("redis", { appType: "bring-your-own", image: "redis:7" }),
    ];

    expect(await coldStartNotice("my-app", nothingToBuild, run)).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});

describe("countBuiltImages", () => {
  it("skips libraries, SDKs, bring-your-own and services that use a ready-made image", () => {
    expect(
      countBuiltImages([
        service("api"),
        service("lib", { appType: "library" }),
        service("sdk", { appType: "sdk" }),
        service("byo", { appType: "bring-your-own" }),
        service("pinned", { image: "nginx:1.27" }),
      ]),
    ).toBe(1);
  });
});

describe("projectImageFilters", () => {
  it("covers every stack in the run", () => {
    expect(
      projectImageFilters("Shop", [service("a", {}, "orders"), service("b", {}, "billing")]),
    ).toEqual([
      "shop_orders_*",
      "shop_orders-db-migrator",
      "shop_billing_*",
      "shop_billing-db-migrator",
    ]);
  });

  it("falls back to the project prefix when no service names a stack", () => {
    const noStack = { ...service("api"), stack: undefined };
    expect(projectImageFilters("shop", [noStack])).toEqual(["shop_*"]);
  });
});

describe("isColdStart", () => {
  it("is false with no filters", async () => {
    expect(await isColdStart([], async () => "")).toBe(false);
  });
});

describe("formatColdStartNotice", () => {
  it("uses the singular for one image", () => {
    expect(formatColdStartNotice(1)).toContain("building 1 image from scratch");
  });
});
