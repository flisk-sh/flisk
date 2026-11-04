// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the workflow-pr-speed scorer, on inline workflows and a small fixture repository.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parseWorkflow } from "./workflow-permissions.mjs";
import { measure, speedProblems, triggers } from "./workflow-pr-speed.mjs";

const FAST = `on:
  pull_request:
concurrency:
  group: x-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
  nightly:
    runs-on: ubuntu-latest
    timeout-minutes: \${{ github.event_name == 'schedule' && 60 || 30 }}
  hardware:
    runs-on: [self-hosted, windows]
    timeout-minutes: 60
`;

const SLOW = `on: [pull_request, push]
concurrency:
  group: x
jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 45
`;

test("triggers reads a string, a list and a map", () => {
	assert.deepEqual(triggers(parseWorkflow("on: push\n")), ["push"]);
	assert.deepEqual(triggers(parseWorkflow("on: [pull_request, push]\n")), ["pull_request", "push"]);
	assert.deepEqual(triggers(parseWorkflow("on:\n  merge_group:\n  schedule: []\n")), ["merge_group", "schedule"]);
});

test("a fast workflow passes: cancel set, jobs within budget, expressions and self-hosted jobs exempt", () => {
	assert.deepEqual(speedProblems("a.yml", parseWorkflow(FAST)), []);
});

test("a slow workflow fails on missing cancel-in-progress and on a job over 30 minutes", () => {
	assert.deepEqual(speedProblems("b.yml", parseWorkflow(SLOW)), [
		"b.yml:2 concurrency does not set cancel-in-progress (superseded runs keep their runners)",
		"b.yml:7 job e2e timeout-minutes 45 is over the 30-minute pull request budget",
	]);
	assert.deepEqual(speedProblems("c.yml", parseWorkflow("on: merge_group\njobs: {}\n")), [
		"c.yml:1 runs on pull requests with no top-level concurrency: (superseded runs keep their runners)",
	]);
	assert.deepEqual(speedProblems("d.yml", parseWorkflow("on: push\njobs:\n  x:\n    timeout-minutes: 90\n")), []);
});

test("measure counts problems across pull request workflows, and a file that does not parse", () => {
	const root = mkdtempSync(path.join(tmpdir(), "workflow-pr-speed-"));
	try {
		for (const [rel, body] of Object.entries({
			".github/workflows/fast.yml": FAST,
			".github/workflows/slow.yml": SLOW,
			".github/workflows/push.yml": "on: push\njobs: {}\n",
			".github/workflows/broken.yml": "jobs: [\n",
		})) {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), body);
		}
		const r = measure({ root });
		assert.equal(r.value, 3);
		assert.match(r.findings[0], /^\.github\/workflows\/broken\.yml:1 does not parse as YAML/);
		assert.equal(r.summary, "3 pull request workflows, 3 that hold runners longer than they need");
	} finally {
		rmSync(root, { recursive: true });
	}
});
