// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  relativeResourceFolder,
  relativeResourceManifest,
} from "../resource-relative-path.js";

const projectRoot = resolve("projects", "demo");

describe("resource paths relative to the project root", () => {
  it("names the resource folder with portable separators", () => {
    const configPath = join(projectRoot, "services", "shop", "orders", "service.json");

    expect(relativeResourceFolder(projectRoot, configPath)).toBe("services/shop/orders");
    expect(relativeResourceManifest(projectRoot, configPath)).toBe(
      "services/shop/orders/service.json",
    );
  });

  it("names a resource at the project root with a dot", () => {
    const configPath = join(projectRoot, "service.json");

    expect(relativeResourceFolder(projectRoot, configPath)).toBe(".");
    expect(relativeResourceManifest(projectRoot, configPath)).toBe("service.json");
  });

  it("keeps parent traversal for a manifest outside the project", () => {
    const configPath = resolve(projectRoot, "..", "shared", "service.json");

    expect(relativeResourceFolder(projectRoot, configPath)).toBe("../shared");
    expect(relativeResourceManifest(projectRoot, configPath)).toBe("../shared/service.json");
  });

  it("never emits a platform separator", () => {
    const configPath = join(projectRoot, "apps", "web", "service.json");

    expect(relativeResourceFolder(projectRoot, configPath)).not.toContain(sep === "/" ? "\\" : sep);
  });
});
