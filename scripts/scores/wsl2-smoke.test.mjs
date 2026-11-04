// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { measure } from "./wsl2-smoke.mjs";

const NOW = new Date("2026-10-28T12:00:00Z");
const REPO = "flisk-sh/flisk";

// A run as `gh api repos/{repo}/actions/workflows/e2e-platforms-wsl2.yml/runs` returns it.
const run = (id, conclusion, day) => ({
	id,
	name: "🪟 E2E | Platforms WSL2",
	event: "workflow_dispatch",
	status: "completed",
	conclusion,
	created_at: `2026-10-${String(day).padStart(2, "0")}T22:46:21Z`,
	html_url: `https://github.com/${REPO}/actions/runs/${id}`,
});

const fakeGh = (runs, calls = []) => (args) => {
	calls.push(args);
	return { total_count: runs.length, workflow_runs: runs };
};

test("the share of the last 10 counted runs, with n and the newest run's date", () => {
	const runs = [
		run(13, "cancelled", 26),
		...Array.from({ length: 9 }, (_, i) => run(12 - i, "success", 25 - i)),
		run(3, "failure", 15),
		run(2, "failure", 14),
	];
	const calls = [];
	const r = measure({ repo: REPO, now: NOW, gh: fakeGh(runs, calls) });
	assert.equal(r.value, 90);
	assert.equal(r.summary, "9 of 10 succeeded (n=10), newest run 2026-10-25; dispatched by hand only");
	assert.deepEqual(r.findings, [`2026-10-15 failure https://github.com/${REPO}/actions/runs/3`]);
	assert.deepEqual(calls, [["api", `repos/${REPO}/actions/workflows/e2e-platforms-wsl2.yml/runs?status=completed&per_page=100&page=1`]]);
});

test("no run, or only cancelled and skipped ones, has no value", () => {
	assert.equal(measure({ repo: REPO, now: NOW, gh: fakeGh([]) }).value, null);
	const r = measure({ repo: REPO, now: NOW, gh: fakeGh([run(2, "cancelled", 20), run(1, "skipped", 19)]) });
	assert.equal(r.value, null);
	assert.match(r.summary, /no completed run of e2e-platforms-wsl2\.yml/);
});
