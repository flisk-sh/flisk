// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getMcpIndexTemplate } from "../../backend-frameworks/mcp.js";
import type { DiscoveredResource } from "../../types/index.js";
import { findMissingHealthRoutes } from "../doctor-runtime.js";
import { isApiServiceType } from "../resource-kind.js";
import { buildHealthTargets, resolveServicePath } from "../service-urls.js";

const resource = (name: string, appType: string, path = `/tmp/${name}`): DiscoveredResource => ({
  name,
  path,
  configPath: `${path}/service.json`,
  config: { appName: name, appType } as DiscoveredResource["config"],
});

describe("isApiServiceType", () => {
  it("is true for a backend and for an mcp server, false for everything else", () => {
    expect(isApiServiceType("backend")).toBe(true);
    expect(isApiServiceType("mcp")).toBe(true);
    for (const other of [
      "frontend",
      "worker",
      "sdk",
      "library",
      "migrator",
      "bring-your-own",
      undefined,
    ]) {
      expect(isApiServiceType(other)).toBe(false);
    }
  });
});

describe("an mcp resource is routed and checked like a backend", () => {
  it("is advertised on the API route, without the stack or -api suffix", () => {
    expect(resolveServicePath(resource("docs-mcp", "mcp"))).toBe("/api/docs-mcp");
    expect(resolveServicePath(resource("orders-api", "mcp"))).toBe("/api/orders");
  });

  it("gets a health target on the API host", () => {
    const targets = buildHealthTargets([resource("docs-mcp", "mcp"), resource("shop", "frontend")]);
    const mcp = targets.find((target) => target.name === "docs-mcp");
    expect(mcp).toBeDefined();
    expect(mcp?.url).toMatch(/^http:\/\/api\./);
    expect(mcp?.url).toMatch(/\/api\/docs-mcp\/health$/);
    expect(targets.find((target) => target.name === "shop")?.url).not.toMatch(/^http:\/\/api\./);
  });
});

describe("doctor's health-route check on the mcp scaffold", () => {
  let root = "";

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("finds the /health route in the generated mcp source", () => {
    root = mkdtempSync(join(tmpdir(), "flisk-mcp-health-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "index.ts"), getMcpIndexTemplate("docs-mcp"));
    expect(findMissingHealthRoutes([resource("docs-mcp", "mcp", root)])).toEqual([]);
  });

  it("reports an mcp resource whose source has no /health route", () => {
    root = mkdtempSync(join(tmpdir(), "flisk-mcp-nohealth-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "index.ts"), "console.log('no routes here');\n");
    expect(findMissingHealthRoutes([resource("docs-mcp", "mcp", root)]).map((m) => m.name)).toEqual(
      ["docs-mcp"],
    );
  });
});
