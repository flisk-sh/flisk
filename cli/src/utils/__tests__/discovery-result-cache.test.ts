// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import fs, { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock findProjectRoot to isolate discovery to dedicated temporary directories
vi.mock("../paths.js", () => ({
  findProjectRoot: vi.fn(),
  getPackageVersion: vi.fn(() => "1.1.0"),
}));

import { projectNeedsDatabaseKeys, resolveProjectCapabilities } from "../capabilities.js";
import { clearDiscoveryCache, createDiscoveryContext } from "../discovery-context.js";
import { findNativeProject } from "../native-project.js";
import { findProjectRoot } from "../paths.js";
import { discoverResourcesWithProblems } from "../services.js";

function createService(projectRoot: string, folder: string, name: string, port: number): void {
  const dir = join(projectRoot, "services", folder, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "service.json"),
    JSON.stringify({ appName: name, appType: "backend", stack: folder, port }),
  );
}

describe("discovery result cache", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "flisk-discovery-cache-"));
    mkdirSync(join(root, ".flisk"), { recursive: true });
    writeFileSync(join(root, ".flisk", "project.json"), JSON.stringify({ name: "cache-test" }));
    clearDiscoveryCache();
    vi.mocked(findProjectRoot).mockReturnValue(root);
  });

  afterEach(() => {
    clearDiscoveryCache();
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it("reads each folder once across capabilities, native-project and direct discovery calls", () => {
    createService(root, "core", "api", 4001);
    // Extra folders make a repeated walk visible in the per-directory counts.
    mkdirSync(join(root, "data", "nested", "deep"), { recursive: true });

    const readdirSpy = vi.spyOn(fs, "readdirSync");

    resolveProjectCapabilities(root);
    projectNeedsDatabaseKeys(root);
    findNativeProject(root);
    const direct = discoverResourcesWithProblems(root);
    const context = createDiscoveryContext();

    expect(direct.resources.map((resource) => resource.name)).toEqual(["api"]);
    expect(context.resources.map((resource) => resource.name)).toEqual(["api"]);

    const walkedDirs = readdirSpy.mock.calls
      .map((call) => call[0])
      .filter((dir): dir is string => typeof dir === "string" && dir.startsWith(root));
    const counts = new Map<string, number>();
    for (const dir of walkedDirs) {
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
    expect(counts.size).toBeGreaterThan(1);
    expect(Math.max(...counts.values())).toBe(1);
  });

  it("keeps the cached answer after a service.json change until the cache is cleared", () => {
    createService(root, "core", "api", 4001);
    expect(discoverResourcesWithProblems(root).resources.map((r) => r.name)).toEqual(["api"]);

    createService(root, "core", "auth", 4002);

    // Same process, no invalidation: still the first answer
    expect(discoverResourcesWithProblems(root).resources.map((r) => r.name)).toEqual(["api"]);

    clearDiscoveryCache(root);
    expect(
      discoverResourcesWithProblems(root)
        .resources.map((r) => r.name)
        .sort(),
    ).toEqual(["api", "auth"]);
  });

  it("createDiscoveryContext(true) forces a fresh filesystem scan", () => {
    createService(root, "core", "api", 4001);
    expect(createDiscoveryContext().resources).toHaveLength(1);

    createService(root, "core", "auth", 4002);

    expect(
      createDiscoveryContext(true)
        .resources.map((r) => r.name)
        .sort(),
    ).toEqual(["api", "auth"]);
  });

  it("does not let a caller mutate the cached arrays", () => {
    createService(root, "core", "api", 4001);

    const first = discoverResourcesWithProblems(root);
    first.resources.pop();
    first.problems.push({ path: "made-up", reason: "caller mutation" });

    const second = discoverResourcesWithProblems(root);
    expect(second.resources.map((r) => r.name)).toEqual(["api"]);
    expect(second.problems).toEqual([]);
  });
});
