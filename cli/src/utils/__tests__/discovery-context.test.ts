// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock findProjectRoot to isolate discovery to dedicated temporary directories
vi.mock("../paths.js", () => ({
  findProjectRoot: vi.fn(),
  getPackageVersion: vi.fn(() => "1.1.0"),
}));

import { clearDiscoveryCache, createDiscoveryContext } from "../discovery-context.js";
import { findProjectRoot } from "../paths.js";

function createService(
  projectRoot: string,
  stack: string,
  name: string,
  port: number,
  appType = "backend",
): void {
  const dir = join(projectRoot, "services", stack, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "service.json"),
    JSON.stringify({
      appName: name,
      appType,
      stack,
      port,
    }),
  );
}

function createUnassignedService(
  projectRoot: string,
  folder: string,
  name: string,
  port: number,
): void {
  const dir = join(projectRoot, "services", folder, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "service.json"),
    JSON.stringify({
      appName: name,
      appType: "worker",
      port,
    }),
  );
}

describe("discovery-context", () => {
  let rootA: string;
  let rootB: string;

  beforeEach(() => {
    rootA = mkdtempSync(join(tmpdir(), "flisk-discovery-a-"));
    rootB = mkdtempSync(join(tmpdir(), "flisk-discovery-b-"));
    clearDiscoveryCache();
    vi.mocked(findProjectRoot).mockReturnValue(rootA);
  });

  afterEach(() => {
    clearDiscoveryCache();
    vi.restoreAllMocks();
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
  });

  describe("createDiscoveryContext", () => {
    it("returns a fresh, valid discovery context for a given project root", () => {
      createService(rootA, "core", "api", 4001);
      createService(rootA, "frontend", "web", 3000, "frontend");
      createUnassignedService(rootA, "shared", "worker", 4002);

      const ctx = createDiscoveryContext();

      expect(ctx).toBeDefined();
      expect(ctx.resources).toHaveLength(3);
      expect(ctx.problems).toEqual([]);

      const names = ctx.resources.map((r) => r.name).sort();
      expect(names).toEqual(["api", "web", "worker"]);

      expect(ctx.stackNames.sort()).toEqual(["core", "frontend"]);
      expect(ctx.stacks).toHaveLength(2);

      expect(ctx.unassignedResources).toHaveLength(1);
      expect(ctx.unassignedResources[0]?.name).toBe("worker");

      expect(ctx.resourcesByStack.has("core")).toBe(true);
      expect(ctx.resourcesByStack.get("core")?.map((r) => r.name)).toEqual(["api"]);

      expect(ctx.resourcesByStack.has("frontend")).toBe(true);
      expect(ctx.resourcesByStack.get("frontend")?.map((r) => r.name)).toEqual(["web"]);
    });

    it("returns cached context on subsequent calls for the same root", () => {
      createService(rootA, "core", "api", 4001);

      const ctx1 = createDiscoveryContext();
      const ctx2 = createDiscoveryContext();

      expect(ctx2).toBe(ctx1);
    });

    it("bypasses cache and returns a fresh context when forceRefresh is true", () => {
      createService(rootA, "core", "api", 4001);

      const ctx1 = createDiscoveryContext();
      const ctx2 = createDiscoveryContext(true);

      expect(ctx2).not.toBe(ctx1);
      expect(ctx2.resources.map((r) => r.name)).toEqual(["api"]);
    });

    it("throws notInProject error when outside of a project root", () => {
      vi.mocked(findProjectRoot).mockReturnValue(null);

      expect(() => createDiscoveryContext()).toThrow("Could not find project root");
    });
  });

  describe("clearDiscoveryCache", () => {
    it("causes the next call to re-read discovery state after clearing a specific root", () => {
      createService(rootA, "core", "api", 4001);

      const initialCtx = createDiscoveryContext();
      expect(initialCtx.resources).toHaveLength(1);
      expect(initialCtx.resources[0]?.name).toBe("api");

      // Mutate filesystem by adding a new service
      createService(rootA, "core", "auth", 4002);

      // Without clearing the cache, createDiscoveryContext returns stale cached state
      const cachedCtx = createDiscoveryContext();
      expect(cachedCtx).toBe(initialCtx);
      expect(cachedCtx.resources).toHaveLength(1);

      // Invalidate the cache for rootA
      clearDiscoveryCache(rootA);

      // The next call re-reads the discovery state from disk
      const refreshedCtx = createDiscoveryContext();
      expect(refreshedCtx).not.toBe(initialCtx);
      expect(refreshedCtx.resources).toHaveLength(2);
      expect(refreshedCtx.resources.map((r) => r.name).sort()).toEqual(["api", "auth"]);
    });

    it("causes all project roots to re-read discovery state when called without arguments", () => {
      createService(rootA, "core", "api", 4001);
      createService(rootB, "billing", "payment", 5001);

      vi.mocked(findProjectRoot).mockReturnValue(rootA);
      const ctxA1 = createDiscoveryContext();
      expect(ctxA1.resources.map((r) => r.name)).toEqual(["api"]);

      vi.mocked(findProjectRoot).mockReturnValue(rootB);
      const ctxB1 = createDiscoveryContext();
      expect(ctxB1.resources.map((r) => r.name)).toEqual(["payment"]);

      // Mutate both roots
      createService(rootA, "core", "metrics", 4003);
      createService(rootB, "billing", "invoice", 5002);

      // Clear all cached contexts
      clearDiscoveryCache();

      // Verify rootA re-reads
      vi.mocked(findProjectRoot).mockReturnValue(rootA);
      const ctxA2 = createDiscoveryContext();
      expect(ctxA2).not.toBe(ctxA1);
      expect(ctxA2.resources.map((r) => r.name).sort()).toEqual(["api", "metrics"]);

      // Verify rootB re-reads
      vi.mocked(findProjectRoot).mockReturnValue(rootB);
      const ctxB2 = createDiscoveryContext();
      expect(ctxB2).not.toBe(ctxB1);
      expect(ctxB2.resources.map((r) => r.name).sort()).toEqual(["invoice", "payment"]);
    });

    it("clearing a specific root leaves other roots in cache", () => {
      createService(rootA, "core", "api", 4001);
      createService(rootB, "billing", "payment", 5001);

      vi.mocked(findProjectRoot).mockReturnValue(rootA);
      const ctxA1 = createDiscoveryContext();

      vi.mocked(findProjectRoot).mockReturnValue(rootB);
      const ctxB1 = createDiscoveryContext();

      // Mutate both roots
      createService(rootA, "core", "auth", 4002);
      createService(rootB, "billing", "invoice", 5002);

      // Invalidate only rootA
      clearDiscoveryCache(rootA);

      // rootB should still return its cached context (ignoring the new invoice service)
      vi.mocked(findProjectRoot).mockReturnValue(rootB);
      const ctxB2 = createDiscoveryContext();
      expect(ctxB2).toBe(ctxB1);
      expect(ctxB2.resources.map((r) => r.name)).toEqual(["payment"]);

      // rootA should re-read and discover auth
      vi.mocked(findProjectRoot).mockReturnValue(rootA);
      const ctxA2 = createDiscoveryContext();
      expect(ctxA2).not.toBe(ctxA1);
      expect(ctxA2.resources.map((r) => r.name).sort()).toEqual(["api", "auth"]);
    });
  });
});
