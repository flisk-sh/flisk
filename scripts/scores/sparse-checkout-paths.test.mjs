// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the sparse-checkout-paths scorer.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { compositePaths, covered, measure, scriptPaths, sparseJobs } from "./sparse-checkout-paths.mjs";

const WORKFLOW = `on: pull_request
permissions: {}
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@abc
        with:
          sparse-checkout: |
            .github/actions
            tests/e2e/lib
      - uses: actions/checkout@abc
        with:
          repository: flisk-sh/example
          path: example
      - uses: ./.github/actions/collect-e2e-evidence
      - run: tests/e2e/lib/run.sh A1 # see scripts/e2e/notes.md
      - run: scripts/e2e/retry-infra.sh tests/e2e/examples/run.sh
      - run: cli/bin/flisk.js doctor
        working-directory: example
  full:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@abc
      - run: scripts/anything.sh
`;

const EVIDENCE = `runs:
  using: composite
  steps:
    - run: scripts/e2e/collect-evidence.sh "$DIR"
      shell: bash
`;

test("scriptPaths reads repository paths from a script, after a checkout prefix, and ignores comments", () => {
	assert.deepEqual(scriptPaths("scripts/e2e/a.sh tests/e2e/x/ # docs/ignored.md\nnode ./cli/bin/flisk.js"), [
		"scripts/e2e/a.sh",
		"tests/e2e/x",
	]);
	assert.deepEqual(scriptPaths("flisk/scripts/e2e/verify.sh template scripts/other.sh", "flisk"), [
		"scripts/e2e/verify.sh",
	]);
	assert.deepEqual(scriptPaths('curl "https://x.dev/scripts/a.sh" > $RUNNER_TEMP/scripts/b'), []);
});

test("covered accepts the pattern itself, its children and root files", () => {
	const patterns = [".github/actions", "scripts/install-global.mjs"];
	assert.equal(covered(".github/actions/setup-bun", patterns), true);
	assert.equal(covered("scripts/install-global.mjs", patterns), true);
	assert.equal(covered("package.json", patterns), true);
	assert.equal(covered("scripts/e2e/retry-infra.sh", patterns), false);
	assert.equal(covered(".github/actions-old/x", patterns), false);
});

test("sparseJobs reads the sparse checkout of this repository, local actions and run paths", () => {
	const { jobs } = sparseJobs(WORKFLOW, (dir) => (dir === ".github/actions/collect-e2e-evidence" ? EVIDENCE : ""));
	assert.equal(jobs.length, 1);
	assert.deepEqual(jobs[0].patterns, [".github/actions", "tests/e2e/lib"]);
	assert.deepEqual(
		jobs[0].uses.map((u) => `${u.path} (${u.via})`),
		[
			".github/actions/collect-e2e-evidence (uses: ./.github/actions/collect-e2e-evidence)",
			"scripts/e2e/collect-evidence.sh (uses: ./.github/actions/collect-e2e-evidence)",
			"tests/e2e/lib/run.sh (run)",
			"scripts/e2e/retry-infra.sh (run)",
			"tests/e2e/examples/run.sh (run)",
		],
	);
});

test("sparseJobs treats a checkout of flisk-sh/flisk by name as this repository", () => {
	const named = WORKFLOW.replace(
		"      - uses: actions/checkout@abc\n        with:\n          sparse",
		"      - uses: actions/checkout@abc\n        with:\n          repository: flisk-sh/flisk\n          sparse",
	);
	assert.equal(sparseJobs(named).jobs.length, 1);
	assert.equal(sparseJobs(named, () => "", "someone/else").jobs.length, 0);
});

test("compositePaths reads run steps of a composite action and tolerates junk", () => {
	assert.deepEqual(compositePaths(EVIDENCE), ["scripts/e2e/collect-evidence.sh"]);
	assert.deepEqual(compositePaths(""), []);
	assert.deepEqual(compositePaths("runs: [\n"), []);
});

test("measure reports each path a sparse job runs but does not check out, once", () => {
	const root = mkdtempSync(path.join(tmpdir(), "sparse-checkout-paths-"));
	try {
		for (const [rel, body] of Object.entries({
			".github/workflows/e2e.yml": WORKFLOW,
			".github/actions/collect-e2e-evidence/action.yml": EVIDENCE,
		})) {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), body);
		}
		const r = measure({ root });
		assert.deepEqual(r.findings, [
			".github/workflows/e2e.yml:16 job e2e uses scripts/e2e/collect-evidence.sh (uses: ./.github/actions/collect-e2e-evidence) but its sparse-checkout has only .github/actions, tests/e2e/lib",
			".github/workflows/e2e.yml:18 job e2e uses scripts/e2e/retry-infra.sh (run) but its sparse-checkout has only .github/actions, tests/e2e/lib",
			".github/workflows/e2e.yml:18 job e2e uses tests/e2e/examples/run.sh (run) but its sparse-checkout has only .github/actions, tests/e2e/lib",
		]);
		assert.equal(r.summary, "1 sparse-checkout jobs, 3 paths they run but do not check out");
	} finally {
		rmSync(root, { recursive: true });
	}
});
