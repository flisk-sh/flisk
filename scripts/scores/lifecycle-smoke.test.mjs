// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { measure, RUNS, WORKFLOW } from "./lifecycle-smoke.mjs";

const REPO = "flisk-sh/flisk";

// A run as `gh api repos/{repo}/actions/workflows/{file}/runs` returns it.
const run = (id, event, conclusion, day) => ({
	id,
	name: "🔄 CI | Packed CLI lifecycle smoke",
	event,
	status: "completed",
	conclusion,
	created_at: `2026-10-${String(day).padStart(2, "0")}T10:00:00Z`,
	html_url: `https://github.com/${REPO}/actions/runs/${id}`,
});

// A fake gh for the workflow runs endpoint: newest first, pages of 100.
function fakeGh(runs, calls = []) {
	return (args) => {
		calls.push(args);
		const url = new URL(`https://api.github.com/${args[1]}`);
		assert.equal(url.pathname, `/repos/${REPO}/actions/workflows/${WORKFLOW}/runs`);
		assert.equal(url.searchParams.get("status"), "completed");
		const per = Number(url.searchParams.get("per_page"));
		const page = Number(url.searchParams.get("page"));
		return { total_count: runs.length, workflow_runs: runs.slice((page - 1) * per, page * per) };
	};
}

test("the pass rate of the last 10 runs that reached a verdict, push and manual dispatch alike", () => {
	const runs = [
		run(20, "push", "success", 27),
		run(19, "push", "cancelled", 26),
		run(18, "workflow_dispatch", "failure", 25),
		run(17, "push", "skipped", 24),
		run(16, "push", "success", 23),
		run(15, "push", "action_required", 22),
		run(14, "push", "success", 21),
		run(13, "push", "timed_out", 20),
		...Array.from({ length: 6 }, (_, i) => run(12 - i, "push", "success", 19 - i)),
		run(1, "push", "failure", 1),
	];
	const r = measure({ repo: REPO, gh: fakeGh(runs) });
	// Counted: 20 ok, 18 fail, 16 ok, 14 ok, 13 timed out, then 12..8 ok (10 runs in all, so 4 + 6 earlier ones fall off).
	assert.equal(RUNS, 10);
	assert.equal(r.value, 80);
	assert.equal(r.summary, "n=10: 8 succeeded; newest 2026-10-27 success; events push, workflow_dispatch");
	assert.deepEqual(r.findings, [
		`2026-10-25 failure https://github.com/${REPO}/actions/runs/18`,
		`2026-10-20 timed_out https://github.com/${REPO}/actions/runs/13`,
	]);
});

test("the newest run's conclusion is in the summary", () => {
	const r = measure({ repo: REPO, gh: fakeGh([run(2, "push", "failure", 27), run(1, "push", "success", 26)]) });
	assert.equal(r.value, 50);
	assert.equal(r.summary, "n=2: 1 succeeded; newest 2026-10-27 failure; events push");
});

test("no completed run, or only cancelled ones, has no value", () => {
	assert.equal(measure({ repo: REPO, gh: fakeGh([]) }).value, null);
	const r = measure({ repo: REPO, gh: fakeGh([run(2, "push", "cancelled", 27), run(1, "push", "skipped", 26)]) });
	assert.equal(r.value, null);
	assert.equal(r.summary, `no completed run of ${WORKFLOW}`);
});
