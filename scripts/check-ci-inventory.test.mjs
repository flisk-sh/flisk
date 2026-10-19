// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the CI inventory rules in check-ci-inventory.mjs. Run by `make test-shell`.
import assert from "node:assert/strict";
import test from "node:test";
import { checkInventory, checkRequiredContexts } from "./check-ci-inventory.mjs";

const job = (workflow, id, extra = {}) => ({
	workflow,
	job: id,
	checkName: id,
	reusable: false,
	hasTimeout: true,
	triggers: ["pull_request"],
	hasConcurrency: true,
	...extra,
});
const entry = (workflow, id, extra = {}) => ({
	workflow,
	job: id,
	tier: "gate",
	required: false,
	reason: "r",
	owner: "maintainers",
	...extra,
});
const run = ({ jobs, entries, contexts = [] }) =>
	checkInventory({ inventory: { jobs: entries }, jobs, contexts });

test("a clean inventory passes", () => {
	const jobs = [
		job("ci.yml", "lint"),
		job("ci.yml", "docs", { reusable: true, hasTimeout: false }),
	];
	assert.deepEqual(
		run({ jobs, entries: [entry("ci.yml", "lint"), entry("ci.yml", "docs")] }),
		[],
	);
});

test("a job without an entry fails and names the workflow", () => {
	const problems = run({ jobs: [job("foo.yml", "build")], entries: [] });
	assert.deepEqual(problems, ["foo.yml build: no entry in the CI inventory"]);
});

test("an entry for a job that no longer exists fails", () => {
	const problems = run({ jobs: [], entries: [entry("gone.yml", "old")] });
	assert.deepEqual(problems, [
		"gone.yml old: the inventory names a job that no longer exists",
	]);
});

test("an unknown tier, a missing reason and a bad exemption each fail", () => {
	const problems = run({
		jobs: [job("ci.yml", "lint")],
		entries: [
			entry("ci.yml", "lint", {
				tier: "platforms",
				reason: "",
				exempt: { timeout: "later" },
			}),
		],
	});
	assert.equal(problems.length, 3);
	assert.match(problems[0], /tier "platforms"/);
	assert.match(problems[1], /"reason" is empty/);
	assert.match(problems[2], /needs a tracking issue/);
});

test("two jobs reporting one check name fail unless both are exempt", () => {
	const jobs = [job("a.yml", "docs"), job("b.yml", "docs")];
	assert.equal(
		run({ jobs, entries: [entry("a.yml", "docs"), entry("b.yml", "docs")] })[0],
		'check name "docs" is reported by a.yml docs and b.yml docs',
	);
	const exempt = { exempt: { "check-name": "#1283" } };
	assert.deepEqual(
		run({
			jobs,
			entries: [entry("a.yml", "docs", exempt), entry("b.yml", "docs", exempt)],
		}),
		[],
	);
});

test("required entries must equal the main merge queue ruleset contexts", () => {
	const jobs = [job("ci.yml", "lint"), job("ci.yml", "gate")];
	const entries = [
		entry("ci.yml", "lint", { required: true }),
		entry("ci.yml", "gate"),
	];
	const problems = run({ jobs, entries, contexts: ["gate"] });
	assert.match(
		problems[0],
		/"lint" is in the inventory but not in the main merge queue ruleset/,
	);
	assert.match(
		problems[1],
		/"gate" is in the main merge queue ruleset but not marked required/,
	);
});

test("a ruleset may require a subset of the inventory when exact is off", () => {
	const jobs = [job("ci.yml", "summary-review", { checkName: "🧐 PR summary review" })];
	const inventory = {
		jobs: [entry("ci.yml", "summary-review", { required: true })],
	};
	assert.deepEqual(
		checkRequiredContexts({ inventory, jobs, contexts: ["🧐 PR summary review"], source: "ruleset 'main merge queue'" }),
		[],
	);
	assert.match(
		checkRequiredContexts({ inventory, jobs, contexts: [], source: "ruleset 'main merge queue'" })[0],
		/not in ruleset 'main merge queue'/,
	);
	assert.deepEqual(
		checkRequiredContexts({ inventory, jobs, contexts: [], source: "ruleset 'main merge queue'", exact: false }),
		[],
	);
});

test("a job without timeout-minutes fails, a reusable-workflow caller does not", () => {
	const jobs = [job("ci.yml", "test", { hasTimeout: false })];
	assert.deepEqual(run({ jobs, entries: [entry("ci.yml", "test")] }), [
		"ci.yml test: no timeout-minutes",
	]);
	assert.deepEqual(
		run({
			jobs,
			entries: [entry("ci.yml", "test", { exempt: { timeout: "#1279" } })],
		}),
		[],
	);
});

test("a pull_request workflow without a concurrency group fails", () => {
	const jobs = [job("dco.yml", "dco", { hasConcurrency: false })];
	assert.deepEqual(run({ jobs, entries: [entry("dco.yml", "dco")] }), [
		"dco.yml dco: runs on pull_request but its workflow has no concurrency group",
	]);
});

test("a report job triggered by push fails, and a scheduled one passes", () => {
	const report = entry("scorecard.yml", "scorecard", { tier: "report" });
	const pushed = job("scorecard.yml", "scorecard", {
		triggers: ["push", "schedule"],
	});
	assert.match(
		run({ jobs: [pushed], entries: [report] })[0],
		/report job triggered by push/,
	);
	const scheduled = job("scorecard.yml", "scorecard", {
		triggers: ["schedule", "workflow_dispatch"],
	});
	assert.deepEqual(run({ jobs: [scheduled], entries: [report] }), []);
});
