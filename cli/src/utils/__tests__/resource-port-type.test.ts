// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { discoverResourcesFromRoot } from "../services.js";

describe("discoverResourcesFromRoot port and type", () => {
  let root = "";

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tdk-resource-port-type-"));
    mkdirSync(join(root, ".tdk"), { recursive: true });
    writeFileSync(join(root, ".tdk", "project.json"), JSON.stringify({ version: "2" }));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns the port and type from each service.json", () => {
    const api = join(root, "services", "shop", "orders-api");
    const web = join(root, "services", "shop", "storefront");
    mkdirSync(api, { recursive: true });
    mkdirSync(web, { recursive: true });
    writeFileSync(
      join(api, "service.json"),
      JSON.stringify({
        appName: "orders-api",
        runtime: "bun",
        appType: "backend",
        port: 4001,
        stack: "shop",
      }),
    );
    writeFileSync(
      join(web, "service.json"),
      JSON.stringify({
        appName: "storefront",
        runtime: "bun",
        appType: "frontend",
        port: 3000,
        stack: "shop",
      }),
    );

    const resources = discoverResourcesFromRoot(root);
    const byName = Object.fromEntries(resources.map((resource) => [resource.name, resource]));

    expect(byName["orders-api"]).toMatchObject({ port: 4001, type: "backend" });
    expect(byName.storefront).toMatchObject({ port: 3000, type: "frontend" });
  });

  it("leaves port undefined when service.json does not set one", () => {
    const api = join(root, "services", "shop", "orders-api");
    mkdirSync(api, { recursive: true });
    writeFileSync(
      join(api, "service.json"),
      JSON.stringify({ appName: "orders-api", runtime: "bun", appType: "backend", stack: "shop" }),
    );

    const [resource] = discoverResourcesFromRoot(root);
    expect(resource.port).toBeUndefined();
    expect(resource.type).toBe("backend");
  });
});
