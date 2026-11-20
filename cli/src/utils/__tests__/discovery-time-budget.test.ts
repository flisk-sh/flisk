// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverResourcesWithProblems } from "../services.js";

// Budget: 3000 ms for 300 services. Measured on a MacBook Pro (Apple M-series,
// macOS 15) with local cli/dist and Bun as `node`: a 300-service stack scans in
// about 219 ms, so the budget is roughly 10x the observed time and leaves room
// for slow CI filesystems without letting a quadratic scan slip through (#4640).
const SERVICE_COUNT = 300;
const DISCOVERY_BUDGET_MS = 3000;

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe("discovery time budget", () => {
  it("discovers 300 services well inside the time budget", () => {
    root = mkdtempSync(join(tmpdir(), "flisk-discovery-budget-"));
    for (let i = 0; i < SERVICE_COUNT; i++) {
      const name = `s${String(i).padStart(3, "0")}`;
      const dir = join(root, "services", "main", name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "service.json"),
        JSON.stringify({
          appName: name,
          appType: "backend",
          name,
          type: "backend",
          stack: "main",
          port: 4000 + i,
          dev: { command: `node server.js --port ${4000 + i}` },
        }),
      );
    }

    const started = performance.now();
    const { resources, problems } = discoverResourcesWithProblems(root);
    const elapsed = performance.now() - started;

    expect(problems).toEqual([]);
    expect(resources).toHaveLength(SERVICE_COUNT);
    expect(elapsed).toBeLessThan(DISCOVERY_BUDGET_MS);
  });
});
