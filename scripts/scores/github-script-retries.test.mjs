// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the github-script-retries scorer, on inline workflows and a small fixture repository.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { githubScriptSteps, measure, retries } from "./github-script-retries.mjs";

const WORKFLOW = `on: push
permissions: {}
jobs:
  comment:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/github-script@abc # v9
        with:
          script: await github.rest.issues.createComment({})
      - uses: actions/github-script@abc # v9
        with:
          retries: 3
          script: await github.rest.issues.createComment({})
      - uses: actions/github-script@abc # v9
        with:
          retries: 0
          script: await github.rest.issues.createComment({})
      - uses: actions/github-script@abc # v9
        with:
          script: |
            const retry = async (fn) => fn();
            await retry(() => github.graphql('{ viewer { login } }'));
      - uses: actions/checkout@abc
`;

test("githubScriptSteps reads each step's retries input and in-script retry helper", () => {
	const { steps } = githubScriptSteps(WORKFLOW);
	assert.deepEqual(
		steps.map(({ line, retries: r, inScript }) => ({ line, retries: r, inScript })),
		[
			{ line: 7, retries: null, inScript: false },
			{ line: 10, retries: "3", inScript: false },
			{ line: 14, retries: "0", inScript: false },
			{ line: 18, retries: null, inScript: true },
		],
	);
	assert.deepEqual(steps.map(retries), [false, true, false, true]);
});

test("githubScriptSteps reads composite actions and reports YAML errors", () => {
	const action =
		"runs:\n  using: composite\n  steps:\n    - uses: actions/github-script@abc\n      with:\n        script: x\n";
	assert.deepEqual(
		githubScriptSteps(action).steps.map((s) => s.where),
		["composite action"],
	);
	assert.match(githubScriptSteps("jobs: [\n").error, /./);
});

test("measure counts steps without a retry across workflows and composite actions", () => {
	const root = mkdtempSync(path.join(tmpdir(), "github-script-retries-"));
	try {
		for (const [rel, body] of Object.entries({
			".github/workflows/a.yml": WORKFLOW,
			".github/actions/post/action.yml":
				"runs:\n  using: composite\n  steps:\n    - uses: actions/github-script@abc\n      with:\n        script: x\n",
		})) {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), body);
		}
		const r = measure({ root });
		assert.equal(r.value, 3);
		assert.deepEqual(r.findings, [
			".github/workflows/a.yml:7 job comment: actions/github-script with no retries:; one GitHub 5xx fails the job (set retries: 3)",
			".github/workflows/a.yml:14 job comment: actions/github-script with retries: 0; one GitHub 5xx fails the job (set retries: 3)",
			".github/actions/post/action.yml:4 composite action: actions/github-script with no retries:; one GitHub 5xx fails the job (set retries: 3)",
		]);
		assert.equal(r.summary, "5 github-script steps, 3 without a retry");
	} finally {
		rmSync(root, { recursive: true });
	}
});
