// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the workflow-timeouts scorer, on inline workflows and a small fixture repository.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parseWorkflow } from "./workflow-permissions.mjs";
import { jobTimeouts, measure } from "./workflow-timeouts.mjs";

const WORKFLOW = `on: push
permissions: {}
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: make
  test:
    runs-on: ubuntu-latest
    steps:
      - run: make test
        timeout-minutes: 5
  call:
    uses: ./.github/workflows/reusable.yml
  matrix:
    runs-on: ubuntu-latest
    timeout-minutes: \${{ inputs.minutes }}
`;

test("jobTimeouts tells set, missing and reusable-workflow jobs apart; a step timeout does not count", () => {
	assert.deepEqual(jobTimeouts(parseWorkflow(WORKFLOW)), [
		{ id: "build", line: 4, reusable: false, timeout: true },
		{ id: "test", line: 9, reusable: false, timeout: false },
		{ id: "call", line: 14, reusable: true, timeout: false },
		{ id: "matrix", line: 16, reusable: false, timeout: true },
	]);
	assert.deepEqual(jobTimeouts(parseWorkflow("on: push\n")), []);
});

test("measure counts jobs without timeout-minutes across workflows, and a file that does not parse", () => {
	const root = mkdtempSync(path.join(tmpdir(), "workflow-timeouts-"));
	try {
		for (const [rel, body] of Object.entries({
			".github/workflows/a.yml": WORKFLOW,
			".github/workflows/b.yml": "jobs:\n  lint:\n    runs-on: x\n",
			".github/workflows/broken.yml": "jobs: [\n",
		})) {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), body);
		}
		const r = measure({ root });
		assert.equal(r.value, 3);
		assert.deepEqual(r.findings.slice(0, 2), [
			".github/workflows/a.yml:9 job test has no timeout-minutes",
			".github/workflows/b.yml:2 job lint has no timeout-minutes",
		]);
		assert.match(r.findings[2], /^\.github\/workflows\/broken\.yml:1 does not parse as YAML/);
		assert.equal(r.summary, "5 jobs (1 reusable-workflow calls exempt), 3 without timeout-minutes");
	} finally {
		rmSync(root, { recursive: true });
	}
});
