// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/coverage-badge.mjs.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "coverage-badge.mjs",
);

function createWorkspace(linesPct) {
  const dir = mkdtempSync(path.join(tmpdir(), "flisk-coverage-badge-test-"));
  mkdirSync(path.join(dir, "cli", "coverage"), { recursive: true });
  mkdirSync(path.join(dir, "docs", "assets"), { recursive: true });

  if (linesPct !== undefined) {
    const summary = {
      total: {
        lines: { total: 100, covered: Math.round(linesPct), skipped: 0, pct: linesPct },
        statements: { total: 100, covered: Math.round(linesPct), skipped: 0, pct: linesPct },
        functions: { total: 100, covered: Math.round(linesPct), skipped: 0, pct: linesPct },
        branches: { total: 100, covered: Math.round(linesPct), skipped: 0, pct: linesPct },
      },
    };
    writeFileSync(
      path.join(dir, "cli", "coverage", "coverage-summary.json"),
      JSON.stringify(summary),
      "utf8",
    );
  }

  return {
    dir,
    svgPath: path.join(dir, "docs", "assets", "coverage.svg"),
    run() {
      return spawnSync(process.execPath, [SCRIPT_PATH], {
        cwd: dir,
        encoding: "utf8",
      });
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("generates low-coverage badge with red color for coverage below 40%", () => {
  const workspace = createWorkspace(35.0);
  try {
    const result = workspace.run();
    assert.equal(result.status, 0, `Script failed: ${result.stderr}`);
    assert.match(result.stdout, /Wrote docs\/assets\/coverage\.svg: line coverage 35%/);

    assert.equal(existsSync(workspace.svgPath), true);
    const svg = readFileSync(workspace.svgPath, "utf8");

    assert.match(svg, /role="img" aria-label="coverage: 35\.0%"/);
    assert.match(svg, /<title>coverage: 35\.0% \(unit test line coverage\)<\/title>/);
    assert.match(svg, /fill="#e05d44"/);
    assert.match(svg, /<text[^>]*>35\.0%<\/text>/);
  } finally {
    workspace.cleanup();
  }
});

test("generates medium-coverage badge with expected colors for mid-range tiers", () => {
  const tiers = [
    { pct: 80.0, expectedColor: "#a3c51c", expectedLabel: "80.0%" },
    { pct: 68.5, expectedColor: "#dfb317", expectedLabel: "68.5%" },
    { pct: 50.0, expectedColor: "#fe7d37", expectedLabel: "50.0%" },
  ];

  for (const { pct, expectedColor, expectedLabel } of tiers) {
    const workspace = createWorkspace(pct);
    try {
      const result = workspace.run();
      assert.equal(result.status, 0, `Script failed for tier ${pct}: ${result.stderr}`);

      assert.equal(existsSync(workspace.svgPath), true);
      const svg = readFileSync(workspace.svgPath, "utf8");

      assert.match(svg, new RegExp(`aria-label="coverage: ${expectedLabel}"`));
      assert.match(svg, new RegExp(`fill="${expectedColor}"`));
      assert.match(svg, new RegExp(`<text[^>]*>${expectedLabel}</text>`));
    } finally {
      workspace.cleanup();
    }
  }
});

test("generates high-coverage badge with bright green color for coverage at or above 90%", () => {
  const tiers = [
    { pct: 90.0, expectedLabel: "90.0%" },
    { pct: 95.4, expectedLabel: "95.4%" },
  ];

  for (const { pct, expectedLabel } of tiers) {
    const workspace = createWorkspace(pct);
    try {
      const result = workspace.run();
      assert.equal(result.status, 0, `Script failed for ${pct}%: ${result.stderr}`);

      assert.equal(existsSync(workspace.svgPath), true);
      const svg = readFileSync(workspace.svgPath, "utf8");

      assert.match(svg, new RegExp(`aria-label="coverage: ${expectedLabel}"`));
      assert.match(
        svg,
        new RegExp(`<title>coverage: ${expectedLabel} \\(unit test line coverage\\)</title>`),
      );
      assert.match(svg, /fill="#4c1"/);
      assert.match(svg, new RegExp(`<text[^>]*>${expectedLabel}</text>`));
    } finally {
      workspace.cleanup();
    }
  }
});

test("fails with clear error when coverage summary file is missing", () => {
  const workspace = createWorkspace(undefined);
  try {
    const result = workspace.run();
    assert.notEqual(
      result.status,
      0,
      "Script should exit with non-zero status when summary is missing",
    );
    assert.match(result.stderr, /ENOENT/);
    assert.match(result.stderr, /cli\/coverage\/coverage-summary\.json/);
    assert.equal(
      existsSync(workspace.svgPath),
      false,
      "Badge SVG should not be written on failure",
    );
  } finally {
    workspace.cleanup();
  }
});
