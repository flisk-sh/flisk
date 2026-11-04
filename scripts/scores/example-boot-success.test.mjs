// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { measure, recentRuns } from "./example-boot-success.mjs";

const NOW = new Date("2026-10-28T12:00:00Z");
const REPO = "flisk-sh/flisk";

// A run as `gh api repos/{repo}/actions/workflows/{file}/runs` returns it (the fields the scorers read, plus a few).
const run = (id, event, conclusion, day) => ({
	id,
	name: "🚪 E2E | Examples gate",
	event,
	status: "completed",
	conclusion,
	created_at: `2026-10-${String(day).padStart(2, "0")}T10:00:00Z`,
	html_url: `https://github.com/${REPO}/actions/runs/${id}`,
	run_attempt: 1,
});

// A fake gh for the workflow runs endpoint: filters by event like the API does and serves pages of 100.
function fakeRunsGh(runs, calls = []) {
	return (args) => {
		calls.push(args);
		assert.equal(args[0], "api");
		const url = new URL(`https://api.github.com/${args[1]}`);
		assert.match(url.pathname, /^\/repos\/flisk-sh\/flisk\/actions\/workflows\/[\w.-]+\.yml\/runs$/);
		assert.equal(url.searchParams.get("status"), "completed");
		const event = url.searchParams.get("event");
		const per = Number(url.searchParams.get("per_page"));
		const page = Number(url.searchParams.get("page"));
		const matching = runs.filter((r) => !event || r.event === event);
		return { total_count: matching.length, workflow_runs: matching.slice((page - 1) * per, page * per) };
	};
}

test("merge_group runs are preferred; cancelled, skipped and unapproved runs are left out", () => {
	const runs = [
		run(9, "pull_request", "failure", 27),
		run(8, "merge_group", "cancelled", 26),
		run(7, "merge_group", "success", 25),
		run(6, "merge_group", "skipped", 24),
		run(5, "merge_group", "failure", 23),
		run(4, "merge_group", "action_required", 22),
		run(3, "merge_group", "success", 21),
		run(2, "merge_group", "timed_out", 20),
	];
	const calls = [];
	const r = measure({ repo: REPO, now: NOW, gh: fakeRunsGh(runs, calls) });
	assert.equal(r.value, 50);
	assert.equal(r.summary, "2 of 4 merge_group runs succeeded, newest 2026-10-25");
	assert.deepEqual(r.findings, [
		`2026-10-23 failure https://github.com/${REPO}/actions/runs/5`,
		`2026-10-20 timed_out https://github.com/${REPO}/actions/runs/2`,
	]);
	assert.deepEqual(calls, [
		["api", `repos/${REPO}/actions/workflows/e2e-examples.yml/runs?status=completed&per_page=100&page=1&event=merge_group`],
	]);
});

test("without a merge_group run every event is used, and the summary says so", () => {
	const runs = [run(3, "pull_request", "success", 27), run(2, "pull_request", "failure", 26), run(1, "workflow_dispatch", "success", 25)];
	const r = measure({ repo: REPO, now: NOW, gh: fakeRunsGh(runs) });
	assert.equal(r.value, 66.7);
	assert.equal(r.summary, "2 of 3 runs of every event (no merge_group run) succeeded, newest 2026-10-27");
});

test("no completed run has no value", () => {
	const r = measure({ repo: REPO, now: NOW, gh: fakeRunsGh([]) });
	assert.equal(r.value, null);
});

test("recentRuns takes the newest `limit` counted runs, paging past a page of cancelled ones", () => {
	const cancelled = Array.from({ length: 100 }, (_, i) => run(1000 - i, "merge_group", "cancelled", 27));
	const counted = Array.from({ length: 40 }, (_, i) => run(500 - i, "merge_group", i % 4 ? "success" : "failure", 20));
	const calls = [];
	const runs = recentRuns(fakeRunsGh([...cancelled, ...counted], calls), REPO, "e2e-examples.yml", {
		limit: 30,
		event: "merge_group",
	});
	assert.equal(runs.length, 30);
	assert.equal(runs[0].id, 500);
	assert.equal(calls.length, 2);
});
