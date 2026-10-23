// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ci = readFileSync(join(repoRoot, ".github", "workflows", "ci.yml"), "utf-8");

/** The `timeout-minutes` of one top-level job in ci.yml, or undefined when it has none. */
function jobTimeoutMinutes(job: string): number | undefined {
  const lines = ci.split("\n");
  const index = lines.findIndex((line) => line.trimEnd() === `  ${job}:`);
  const start =
    index === -1 ? -1 : lines.slice(0, index).reduce((offset, line) => offset + line.length + 1, 0);
  expect(start, `job ${job} not found in ci.yml`).toBeGreaterThanOrEqual(0);
  const rest = ci.slice(start + 1);
  const next = rest.search(/^ {2}[a-z0-9-]+:\s*$/m);
  const block = next === -1 ? rest : rest.slice(0, next);
  const match = block.match(/^\s+timeout-minutes:\s*(\d+)/m);
  return match ? Number(match[1]) : undefined;
}

describe("ci.yml job timeouts", () => {
  // The Test job runs the whole CLI suite, including every Starlark test that spawns `tilt`. It took 23 to 89 seconds on recent runs and
  // was cancelled at the old one-minute limit in 3 of 19 runs, with no failing step. That limit is a hang guard, not a speed target,
  // so it has to sit well above the real duration and must not be tuned down to it.
  it("gives the Test job a timeout well above its real duration", () => {
    expect(jobTimeoutMinutes("test")).toBeGreaterThanOrEqual(5);
  });

  it("keeps a timeout on every job, so a hang cannot run for six hours", () => {
    for (const job of ["lint", "typecheck", "test", "package-smoke", "published-schema"]) {
      expect(jobTimeoutMinutes(job), `job ${job} has no timeout-minutes`).toBeDefined();
    }
  });
});
