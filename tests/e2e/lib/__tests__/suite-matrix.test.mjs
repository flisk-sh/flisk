// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for tests/e2e/lib/suite-matrix.mjs. Run by `make test-shell`.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { selectSuites } from "../suite-matrix.mjs";

function fixture(suites) {
  const dir = mkdtempSync(path.join(tmpdir(), "suite-matrix-"));
  for (const [group, suite, body] of suites) {
    mkdirSync(path.join(dir, group, suite), { recursive: true });
    writeFileSync(path.join(dir, group, suite, "suite.json"), JSON.stringify(body));
  }
  return dir;
}

const leg = (suite, timeoutMinutes, language = "", framework = "") => ({
  suite,
  language,
  framework,
  label: [suite, language, framework].filter(Boolean).join("-"),
  timeoutMinutes,
});

test("selects the suites of one group whose triggers include the event, sorted by name", () => {
  const dir = fixture([
    ["resource-types", "worker", { suite: "worker", triggers: ["pr"], timeoutMinutes: 10 }],
    ["resource-types", "agent", { suite: "agent", triggers: ["pr", "nightly"], timeoutMinutes: 30 }],
    ["resource-types", "sdk", { suite: "sdk", triggers: ["nightly"], timeoutMinutes: 15 }],
    ["journeys", "smoke", { suite: "smoke", triggers: ["pr"], timeoutMinutes: 5 }],
  ]);
  try {
    assert.deepEqual(selectSuites(dir, "resource-types", "pr"), [leg("agent", 30), leg("worker", 10)]);
    assert.deepEqual(selectSuites(dir, "resource-types", "nightly"), [leg("agent", 30), leg("sdk", 15)]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the backend suite gets one leg per language, and the other suites are unchanged", () => {
  const dir = fixture([
    ["resource-types", "agent", { suite: "agent", triggers: ["pr"], timeoutMinutes: 30 }],
    ["resource-types", "backend", { suite: "backend", triggers: ["pr", "nightly"], timeoutMinutes: 25 }],
  ]);
  try {
    assert.deepEqual(selectSuites(dir, "resource-types", "pr", ["bun", "python"]), [
      leg("agent", 30),
      leg("backend", 25, "bun"),
      leg("backend", 25, "python"),
    ]);
    assert.deepEqual(selectSuites(dir, "resource-types", "nightly", ["go"]), [leg("backend", 25, "go")]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the backend suite adds one bun leg per non-default framework, and never the default", () => {
  const dir = fixture([["resource-types", "backend", { suite: "backend", triggers: ["nightly"], timeoutMinutes: 25 }]]);
  try {
    assert.deepEqual(selectSuites(dir, "resource-types", "nightly", ["bun", "python"], ["hono", "express", "koa"]), [
      leg("backend", 25, "bun"),
      leg("backend", 25, "python"),
      leg("backend", 25, "bun", "express"),
      leg("backend", 25, "bun", "koa"),
    ]);
    assert.deepEqual(selectSuites(dir, "resource-types", "nightly", ["bun"], []), [leg("backend", 25, "bun")]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the frontend suite gets one leg per framework, with the framework set on each", () => {
  const dir = fixture([["resource-types", "frontend", { suite: "frontend", triggers: ["nightly"], timeoutMinutes: 30 }]]);
  try {
    const legs = selectSuites(dir, "resource-types", "nightly", [], [], ["react", "vue"]);
    assert.deepEqual(legs, [
      { suite: "frontend", language: "", framework: "react", label: "frontend-react", timeoutMinutes: 30 },
      { suite: "frontend", language: "", framework: "vue", label: "frontend-vue", timeoutMinutes: 30 },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an event no suite lists selects nothing, and a missing group is empty", () => {
  const dir = fixture([["resource-types", "agent", { suite: "agent", triggers: ["pr"], timeoutMinutes: 30 }]]);
  try {
    assert.deepEqual(selectSuites(dir, "resource-types", "weekly"), []);
    assert.deepEqual(selectSuites(dir, "platforms", "pr"), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the repository's resource-type suites are selected on pull requests", () => {
  const e2e = path.resolve(import.meta.dirname, "..", "..");
  const suites = selectSuites(e2e, "resource-types", "pr", ["bun"]).map((l) => l.suite);
  assert.ok(suites.includes("agent"));
  assert.ok(suites.includes("backend"));
});
