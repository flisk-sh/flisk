// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrationPlan, buildMigrationPlan } from "../config-migrate.js";

describe("config migration plan", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "flisk-migrate-plan-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeService(dir: string, body: Record<string, unknown>): string {
    const file = join(root, "services", dir, "service.json");
    mkdirSync(join(root, "services", dir), { recursive: true });
    writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
    return file;
  }

  it("builds a read-only plan from an old schema and applies exactly that plan", () => {
    const file = writeService("api", {
      appName: "api",
      stack: "shop",
      type: "backend",
      extra: true,
    });
    const before = readFileSync(file, "utf-8");

    const plan = buildMigrationPlan(root);

    expect(plan.totalFiles).toBe(1);
    expect(plan.failures).toEqual([]);
    expect(plan.pending).toHaveLength(1);
    expect(plan.pending[0]?.filePath).toBe(file);
    expect(plan.pending[0]?.manifest).toMatchObject({
      appType: "backend",
      schemaVersion: 1,
      extra: true,
    });
    expect(readFileSync(file, "utf-8")).toBe(before);

    applyMigrationPlan(plan);

    expect(JSON.parse(readFileSync(file, "utf-8"))).toMatchObject({
      appType: "backend",
      schemaVersion: 1,
      extra: true,
    });
  });

  it("reports an unsupported version in the plan and never writes it", () => {
    const file = writeService("future", { appType: "api", schemaVersion: 99 });
    const before = readFileSync(file, "utf-8");

    const plan = buildMigrationPlan(root);

    expect(plan.pending).toEqual([]);
    expect(plan.failures[0]).toContain("cannot migrate unsupported version 99");
    applyMigrationPlan(plan);
    expect(readFileSync(file, "utf-8")).toBe(before);
  });
});
