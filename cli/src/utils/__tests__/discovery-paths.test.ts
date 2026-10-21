// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chooseResourcePath, isPathDiscovered, readDiscoveryPaths } from "../discovery-paths.js";

describe("discovery paths", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "flisk-discovery-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeProjectJson(paths: unknown) {
    mkdirSync(join(root, ".tdk"), { recursive: true });
    writeFileSync(join(root, ".tdk", "project.json"), JSON.stringify({ discovery: { paths } }));
  }

  it("falls back to services/*/* without a usable project.json", () => {
    expect(readDiscoveryPaths(root)).toEqual(["services/*/*"]);
    writeProjectJson("not-an-array");
    expect(readDiscoveryPaths(root)).toEqual(["services/*/*"]);
  });

  it("matches a resource dir like Tilt's glob + find -maxdepth 3 does", () => {
    const patterns = ["services/*/*"];
    expect(isPathDiscovered(root, "services/shop/orders-api", patterns)).toBe(true);
    // service.json up to two levels below a matched directory is still found
    expect(isPathDiscovered(root, "services/shop/orders-api/nested/deeper", patterns)).toBe(true);
    expect(isPathDiscovered(root, "services/shop/orders-api/a/b/c", patterns)).toBe(false);
    expect(isPathDiscovered(root, "apps/storefront", patterns)).toBe(false);
    expect(isPathDiscovered(root, "services/shop", patterns)).toBe(false);
  });

  it("treats regex metacharacters in a pattern as literal text", () => {
    expect(isPathDiscovered(root, "apps/a+b", ["apps/a+b"])).toBe(true);
    expect(isPathDiscovered(root, "apps/aab", ["apps/a+b"])).toBe(false);
    expect(isPathDiscovered(root, "apps/a.b", ["apps/a.b"])).toBe(true);
    expect(isPathDiscovered(root, "apps/axb", ["apps/a.b"])).toBe(false);
  });

  it("matches hostile wildcard patterns quickly without backtracking blow-up", () => {
    const hostile = "a*".repeat(30) + "b";
    const started = Date.now();
    expect(isPathDiscovered(root, `apps/${"a".repeat(5000)}`, [`apps/${hostile}`])).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("supports literal, wildcard and multiple patterns", () => {
    expect(isPathDiscovered(root, "apps/storefront", ["apps/*"])).toBe(true);
    expect(isPathDiscovered(root, "apps/storefront", ["services/*/*", "apps"])).toBe(true);
    expect(isPathDiscovered(root, "identity-auth", ["identity-*"])).toBe(true);
    expect(isPathDiscovered(root, "billing-auth", ["identity-*"])).toBe(false);
  });

  it("keeps the conventional folder when discovery covers it", () => {
    writeProjectJson(["services/*/*", "apps/*"]);
    expect(chooseResourcePath(root, "apps/storefront", "shop", "storefront")).toEqual({
      path: "apps/storefront",
    });
  });

  it("moves a resource under services/<stack>/ when its conventional folder is not discovered", () => {
    writeProjectJson(["services/*/*"]);
    expect(chooseResourcePath(root, "apps/storefront", "shop", "storefront")).toEqual({
      path: "services/shop/storefront",
      adjustedFrom: "apps/storefront",
    });
  });

  it("keeps the conventional folder when no default location is discovered either", () => {
    writeProjectJson(["packages/*"]);
    expect(chooseResourcePath(root, "apps/storefront", "shop", "storefront")).toEqual({
      path: "apps/storefront",
    });
  });
});
