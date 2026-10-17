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

const leg = (suite, timeoutMinutes, language = "") => ({
  suite,
  language,
  label: language ? `${suite}-${language}` : suite,
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
