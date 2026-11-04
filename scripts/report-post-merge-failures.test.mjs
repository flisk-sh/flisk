// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/report-post-merge-failures.mjs (#2897). Run by `make test-shell`.
import assert from "node:assert/strict";
import test from "node:test";
import { commentBody, issueTitle, MARKER, shouldReport } from "./report-post-merge-failures.mjs";

const run = (extra = {}) => ({
	name: "Checks",
	conclusion: "failure",
	event: "pull_request",
	head_sha: "abc",
	html_url: "https://example.test/runs/1",
	...extra,
});
const pr = (extra = {}) => ({ number: 7, merged_at: "2026-11-01T00:00:00Z", head: { sha: "abc" }, ...extra });

test("a failed run on the merged head commit is reported", () => {
	assert.equal(shouldReport(run(), pr()), true);
	assert.equal(shouldReport(run({ conclusion: "timed_out" }), pr()), true);
});

test("success, cancelled and skipped runs are not reported", () => {
	for (const conclusion of ["success", "cancelled", "skipped", null])
		assert.equal(shouldReport(run({ conclusion }), pr()), false);
});

test("an unmerged pull request is not reported", () => {
	assert.equal(shouldReport(run(), pr({ merged_at: null })), false);
});

test("a failure on a superseded commit is not reported", () => {
	assert.equal(shouldReport(run({ head_sha: "old" }), pr()), false);
});

test("push and merge_group runs are not reported", () => {
	assert.equal(shouldReport(run({ event: "push" }), pr()), false);
	assert.equal(shouldReport(run({ event: "merge_group" }), pr()), false);
});

test("title names the pull request and the comment carries the dedupe marker and run url", () => {
	assert.equal(issueTitle(7), "Merged with red checks: #7");
	assert.ok(commentBody(run()).includes(MARKER));
	assert.ok(commentBody(run()).includes("https://example.test/runs/1"));
});
