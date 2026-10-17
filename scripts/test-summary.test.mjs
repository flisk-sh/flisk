// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/test-summary.mjs. Run by `make test-shell`.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  changedLineCoverage,
  coverageChanged,
  e2eRuns,
  isFailing,
  MARKER,
  parseAddedLines,
  render,
  shouldPost,
  unitCounts,
} from "./test-summary.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = (name) => path.join(root, "cli", "src", "utils", "__tests__", name);

// The shape of Vitest's JSON reporter output (the fields the summary reads), for one passing and one failing file.
function vitestReport({ failing = false } = {}) {
  return {
    numTotalTests: 4,
    numPassedTests: failing ? 2 : 3,
    numFailedTests: failing ? 1 : 0,
    numPendingTests: 1,
    numTodoTests: 0,
    numFailedTestSuites: failing ? 1 : 0,
    testResults: [
      {
        name: file("validation.test.ts"),
        status: "passed",
        message: "",
        assertionResults: [{ fullName: "accepts a name", status: "passed", failureMessages: [] }],
      },
      {
        name: file("probe.test.ts"),
        status: failing ? "failed" : "passed",
        message: "",
        assertionResults: [
          { fullName: "skips probe", status: "pending", failureMessages: [] },
          {
            fullName: "fails probe",
            status: failing ? "failed" : "passed",
            failureMessages: failing
              ? ["AssertionError: expected 1 to be 2\n    at probe.test.ts:4:37"]
              : [],
          },
          { fullName: "passes probe", status: "passed", failureMessages: [] },
        ],
      },
    ],
  };
}

const ratchet = (failures = []) => ({
  areas: {
    validation: {
      files: 1,
      metrics: {
        lines: { actual: 100, baseline: 100 },
        branches: { actual: 95.83, baseline: 95.83 },
      },
    },
  },
  failures,
});

test("unitCounts reads pass, fail and skip from the JSON reporter fields", () => {
  const counts = unitCounts(vitestReport());
  assert.deepEqual(
    { total: counts.total, pass: counts.pass, fail: counts.fail, skip: counts.skip },
    { total: 4, pass: 3, fail: 0, skip: 1 },
  );
  assert.deepEqual(counts.failed, []);
});

test("unitCounts names each failed test with its file and first failure line", () => {
  const counts = unitCounts(vitestReport({ failing: true }));
  assert.equal(counts.fail, 1);
  assert.deepEqual(counts.failed, [
    {
      file: "cli/src/utils/__tests__/probe.test.ts",
      name: "fails probe",
      message: "AssertionError: expected 1 to be 2",
    },
  ]);
});

test("unitCounts reports a file that failed to run without any failed assertion", () => {
  const report = vitestReport();
  report.testResults[1] = {
    name: file("probe.test.ts"),
    status: "failed",
    message: "SyntaxError: boom",
    assertionResults: [],
  };
  const counts = unitCounts(report);
  assert.deepEqual(counts.suiteErrors, [
    { file: "cli/src/utils/__tests__/probe.test.ts", message: "SyntaxError: boom" },
  ]);
  assert.equal(isFailing({ unit: counts, ratchet: null, testResult: "success" }), true);
});

test("e2eRuns keeps the newest run of each e2e-tier workflow and ignores other workflows", () => {
  const inventory = {
    jobs: [
      { workflow: "smoke-e2e.yml", job: "smoke", tier: "e2e" },
      { workflow: "ci.yml", job: "test", tier: "test" },
    ],
  };
  const runs = [
    {
      path: ".github/workflows/smoke-e2e.yml",
      name: "Smoke",
      status: "in_progress",
      conclusion: null,
      html_url: "u2",
    },
    {
      path: ".github/workflows/smoke-e2e.yml",
      name: "Smoke",
      status: "completed",
      conclusion: "failure",
      html_url: "u1",
    },
    {
      path: ".github/workflows/ci.yml",
      name: "CI",
      status: "completed",
      conclusion: "success",
      html_url: "u3",
    },
  ];
  assert.deepEqual(e2eRuns(runs, inventory), [
    { path: ".github/workflows/smoke-e2e.yml", name: "Smoke", result: "in_progress", url: "u2" },
  ]);
});

test("a summary is created when something failed or coverage changed, and edited once it exists", () => {
  assert.equal(shouldPost({ existing: false, failing: false, moved: false }), false);
  assert.equal(shouldPost({ existing: false, failing: true, moved: false }), true);
  assert.equal(shouldPost({ existing: false, failing: false, moved: true }), true);
  assert.equal(shouldPost({ existing: true, failing: false, moved: false }), true);
});

test("isFailing counts an E2E run that failed, even when the unit tests passed", () => {
  const unit = unitCounts(vitestReport());
  const e2e = [{ path: "x", name: "Smoke", result: "failure", url: "u" }];
  assert.equal(isFailing({ unit, ratchet: ratchet(), e2e, testResult: "success" }), true);
  assert.equal(isFailing({ unit, ratchet: ratchet(), e2e: [], testResult: "success" }), false);
  assert.equal(isFailing({ unit, ratchet: ratchet(), e2e: null, testResult: "success" }), false);
});

test("coverageChanged is true only when a line or branch figure rose above its baseline", () => {
  assert.equal(coverageChanged(ratchet()), false);
  assert.equal(coverageChanged(null), false);
  const raised = ratchet();
  raised.areas.validation.metrics.lines = { actual: 100, baseline: 98.5 };
  assert.equal(coverageChanged(raised), true);
  const tiny = ratchet();
  tiny.areas.validation.metrics.branches = { actual: 95.835, baseline: 95.83 };
  assert.equal(coverageChanged(tiny), false);
});

test("render puts the counts, the failed names and the links in one marked comment", () => {
  const unit = unitCounts(vitestReport({ failing: true }));
  const body = render({
    unit,
    ratchet: ratchet(),
    coverage: { lines: { pct: 42.5, covered: 425, total: 1000 }, branches: { pct: 30.1 } },
    changed: {
      total: 4,
      covered: 3,
      percent: 75,
      files: [{ file: "cli/src/utils/x.ts", uncovered: [12] }],
    },
    e2e: [{ path: "x", name: "Smoke", result: "success", url: "https://example.test/run/2" }],
    testResult: "failure",
    runUrl: "https://example.test/run/1",
    sha: "0123456789abcdef",
  });
  assert.ok(body.startsWith(MARKER));
  assert.match(body, /### ❌ Test summary for `0123456`/);
  assert.match(body, /\| 2 \| 1 \| 1 \| 4 \|/);
  assert.match(body, /`cli\/src\/utils\/__tests__\/probe.test.ts` › fails probe/);
  assert.match(body, /\*\*75\.00%\*\* \(3\/4 changed lines run by a unit test\)/);
  assert.match(body, /`cli\/src\/utils\/x\.ts`: 12/);
  assert.match(body, /lines 42\.5% \(425\/1000\)/);
  assert.doesNotMatch(body, /Δ vs baseline/);
  assert.match(body, /\| Smoke \| ✅ success \| \[open\]\(https:\/\/example\.test\/run\/2\) \|/);
  assert.match(body, /\[workflow run\]\(https:\/\/example\.test\/run\/1\)/);
});

test("render shows a green summary and says when a job never produced its report", () => {
  const body = render({
    unit: unitCounts(vitestReport()),
    ratchet: ratchet(),
    coverage: null,
    e2e: null,
    testResult: "success",
    runUrl: "https://example.test/run/1",
    sha: "abcdef0",
  });
  assert.match(body, /### ✅ Test summary/);
  assert.doesNotMatch(body, /Failed tests/);

  const missing = render({
    unit: null,
    ratchet: null,
    coverage: null,
    e2e: null,
    testResult: "failure",
    runUrl: "u",
    sha: "abcdef0",
  });
  assert.match(missing, /### ❌/);
  assert.match(missing, /Not produced: the Test job stopped before its unit test report step/);
  assert.match(missing, /Not produced: the coverage report did not finish/);
});

test("render escapes HTML in failure messages and bounds the failed list", () => {
  const unit = unitCounts(vitestReport({ failing: true }));
  unit.failed = Array.from({ length: 25 }, (_, i) => ({
    file: "a.test.ts",
    name: `t${i}`,
    message: "<b>x</b> & y",
  }));
  const body = render({
    unit,
    ratchet: null,
    coverage: null,
    e2e: null,
    testResult: "failure",
    runUrl: "u",
    sha: "abcdef0",
  });
  assert.match(body, /Failed tests \(25\)/);
  assert.match(body, /&lt;b&gt;x&lt;\/b&gt; &amp; y/);
  assert.match(body, /…and 5 more/);
});

test("parseAddedLines reads the new line numbers of each hunk, keyed by repo-relative file", () => {
  const diff = [
    "diff --git a/cli/src/a.ts b/cli/src/a.ts",
    "--- a/cli/src/a.ts",
    "+++ b/cli/src/a.ts",
    "@@ -3,0 +4,2 @@ context",
    "+one",
    "+two",
    "@@ -10 +20 @@",
    "-old",
    "+new",
    "diff --git a/cli/src/gone.ts b/cli/src/gone.ts",
    "+++ /dev/null",
    "@@ -1,2 +0,0 @@",
  ].join("\n");
  const added = parseAddedLines(diff);
  assert.deepEqual(
    [...added.get("cli/src/a.ts")].sort((x, y) => x - y),
    [4, 5, 20],
  );
  assert.equal(added.has("cli/src/gone.ts"), false);
});

// A statement map and hit counts shaped like istanbul's coverage-final.json.
function coverageEntry(file, statements) {
  const statementMap = {};
  const s = {};
  statements.forEach(([line, hits], i) => {
    statementMap[i] = { start: { line }, end: { line } };
    s[i] = hits;
  });
  return { [path.join(root, file)]: { path: path.join(root, file), statementMap, s } };
}

test("changedLineCoverage counts only added executable lines, and a line is covered when a statement on it ran", () => {
  const coverage = {
    ...coverageEntry("cli/src/a.ts", [
      [4, 1],
      [5, 0],
      [5, 2],
      [6, 0],
      [9, 0],
    ]),
    ...coverageEntry("cli/src/a.test.ts", [[4, 0]]),
  };
  const added = new Map([
    ["cli/src/a.ts", new Set([4, 5, 6])],
    ["cli/src/a.test.ts", new Set([4])],
    ["cli/docs/x.ts", new Set([1])],
  ]);
  const result = changedLineCoverage(coverage, added);
  assert.equal(result.total, 3);
  assert.equal(result.covered, 2);
  assert.deepEqual(result.files, [{ file: "cli/src/a.ts", uncovered: [6] }]);
  assert.equal(changedLineCoverage(coverage, new Map()).percent, null);
});
