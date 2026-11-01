// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for cancel-dead-queue-runs: which runs count as dead, with the branch lookup injected.
import assert from "node:assert/strict";
import test from "node:test";
import { deadQueueRuns } from "./cancel-dead-queue-runs.mjs";

const run = (id, head_branch, over = {}) => ({ id, name: "E2E | Resource types", status: "queued", event: "merge_group", head_branch, ...over });
const LIVE = "gh-readonly-queue/main/pr-1-aaa";
const DEAD = "gh-readonly-queue/main/pr-2-bbb";
const exists = (branch) => branch === LIVE;

test("a queued or in-progress merge_group run on a branch that is gone is dead", () => {
	const runs = [run(1, DEAD), run(2, DEAD, { status: "in_progress" })];
	assert.deepEqual(deadQueueRuns(runs, exists).map((r) => r.id), [1, 2]);
});

test("a run on a live queue branch is kept", () => {
	assert.deepEqual(deadQueueRuns([run(1, LIVE)], exists), []);
});

test("only merge_group runs on queue branches are touched, whatever their branch", () => {
	const runs = [
		run(1, "fix/something", { event: "pull_request" }),
		run(2, "main", { event: "push" }),
		run(3, "fix/something"), // merge_group event but not a queue branch
		run(4, DEAD, { status: "completed" }),
		run(5, null),
	];
	assert.deepEqual(deadQueueRuns(runs, exists), []);
});

test("each branch is looked up once, however many runs it has", () => {
	let lookups = 0;
	const runs = [run(1, DEAD), run(2, DEAD), run(3, DEAD), run(4, LIVE)];
	deadQueueRuns(runs, (branch) => {
		lookups++;
		return exists(branch);
	});
	assert.equal(lookups, 2);
});

test("a failed lookup is not read as a missing branch: the error propagates and nothing is cancelled", () => {
	assert.throws(() => deadQueueRuns([run(1, DEAD)], () => {
		throw new Error("HTTP 502");
	}), /HTTP 502/);
});
