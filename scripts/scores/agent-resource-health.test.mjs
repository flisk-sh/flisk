// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { measure } from "./agent-resource-health.mjs";

const NOW = new Date("2026-10-28T12:00:00Z");
const REPO = "flisk-sh/flisk";

const run = (id, event, conclusion, day) => ({
	id,
	name: "🧩 E2E | Resource types",
	event,
	status: "completed",
	conclusion,
	created_at: `2026-10-${String(day).padStart(2, "0")}T13:24:29Z`,
	html_url: `https://github.com/${REPO}/actions/runs/${id}`,
});

// A job as `gh api repos/{repo}/actions/runs/{id}/jobs` returns it.
const job = (runId, n, name, conclusion = "success", status = "completed") => ({
	id: runId * 100 + n,
	run_id: runId,
	name,
	status,
	conclusion,
	html_url: `https://github.com/${REPO}/actions/runs/${runId}/job/${runId * 100 + n}`,
});

// The jobs of a nightly run: the plan, the gate, language legs and the two suites the scorer reads.
const nightly = (id, agent = "success", mcp = "success") => [
	job(id, 1, "Plan the resource-type suites"),
	job(id, 2, "languages / node"),
	job(id, 3, "resource-types / agent", agent),
	job(id, 4, "resource-types / bring-your-own-example", "failure"),
	job(id, 5, "resource-types / mcp", mcp),
	job(id, 6, "e2e-resource-types"),
];
// A release run whose release failed: the plan is skipped and the matrix job keeps its unexpanded name.
const noLegs = (id) => [
	job(id, 1, "e2e-resource-types"),
	job(id, 2, "Plan the resource-type suites", "skipped"),
	job(id, 3, "${{ matrix.group }} / ${{ matrix.label }}", "skipped"),
];

// A fake gh: the runs endpoint filtered by event, and the jobs endpoint as `--paginate --slurp` prints it.
function fakeGh(runs, jobsByRun, calls = []) {
	return (args) => {
		calls.push(args);
		const url = new URL(`https://api.github.com/${args[1]}`);
		const jobs = /\/actions\/runs\/(\d+)\/jobs$/.exec(url.pathname);
		if (jobs) {
			assert.deepEqual(args.slice(2), ["--paginate", "--slurp"]);
			const all = jobsByRun[jobs[1]] ?? [];
			return [{ total_count: all.length, jobs: all }];
		}
		assert.match(url.pathname, /\/actions\/workflows\/e2e-resource-types\.yml\/runs$/);
		const event = url.searchParams.get("event");
		const matching = runs.filter((r) => r.event === event);
		return { total_count: matching.length, workflow_runs: Number(url.searchParams.get("page")) === 1 ? matching : [] };
	};
}

test("the share of agent and mcp jobs that passed, by exact job name, over runs that ran them", () => {
	const runs = [
		run(10, "pull_request", "failure", 27),
		run(9, "workflow_run", "success", 26),
		run(8, "schedule", "failure", 25),
		run(7, "workflow_dispatch", "cancelled", 24),
		run(6, "workflow_dispatch", "success", 23),
		run(5, "merge_group", "failure", 22),
	];
	const jobsByRun = {
		10: [job(10, 1, "resource-types / agent", "failure")],
		9: noLegs(9),
		8: nightly(8, "success", "failure"),
		7: nightly(7, "cancelled", "cancelled"),
		// A cancelled job, and jobs whose name only contains "agent" or "mcp", are not counted.
		6: [
			...nightly(6),
			job(6, 7, "resource-types / agent", "cancelled"),
			job(6, 8, "languages / agent", "failure"),
			job(6, 9, "resource-types / mcp-sdk", "failure"),
		],
		5: [job(5, 1, "resource-types / agent", "failure")],
	};
	const calls = [];
	const r = measure({ repo: REPO, now: NOW, gh: fakeGh(runs, jobsByRun, calls) });
	assert.equal(r.value, 75);
	assert.equal(r.summary, "3 of 4 jobs passed (agent 2/2, mcp 1/2) over 2 nightly, release or manual runs");
	assert.deepEqual(r.findings, [`2026-10-25 resource-types / mcp failure https://github.com/${REPO}/actions/runs/8/job/805`]);
	// Pull request and merge-queue runs are never listed, and the cancelled run's jobs are never read.
	const events = calls.filter((a) => a[1].includes("/workflows/")).map((a) => new URL(`https://x/${a[1]}`).searchParams.get("event"));
	assert.deepEqual(events, ["schedule", "workflow_run", "workflow_dispatch"]);
	const read = calls.filter((a) => a[1].includes("/jobs")).map((a) => a[1]);
	assert.deepEqual(read, [9, 8, 6].map((id) => `repos/${REPO}/actions/runs/${id}/jobs?per_page=100`));
});

test("stops after 20 runs that ran a leg, newest first", () => {
	const runs = Array.from({ length: 25 }, (_, i) => run(100 - i, "schedule", "success", 27 - i));
	const jobsByRun = Object.fromEntries(runs.map((r, i) => [r.id, nightly(r.id, i < 20 ? "success" : "failure")]));
	const calls = [];
	const r = measure({ repo: REPO, now: NOW, gh: fakeGh(runs, jobsByRun, calls) });
	assert.equal(r.value, 100);
	assert.equal(r.summary, "40 of 40 jobs passed (agent 20/20, mcp 20/20) over 20 nightly, release or manual runs");
	assert.equal(calls.filter((a) => a[1].includes("/jobs")).length, 20);
});

test("no agent or mcp job has no value", () => {
	const r = measure({ repo: REPO, now: NOW, gh: fakeGh([run(9, "workflow_run", "success", 26)], { 9: noLegs(9) }) });
	assert.equal(r.value, null);
	assert.equal(r.summary, "no agent or mcp job in the last 1 nightly, release or manual runs");
});
