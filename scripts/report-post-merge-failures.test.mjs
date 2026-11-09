// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/report-post-merge-failures.mjs (#2897). Run by `make test-shell`.
import assert from "node:assert/strict";
import test from "node:test";
import { canonicalIssue, commentBody, fileIssue, issueTitle, MARKER, redJobs, shouldReport } from "./report-post-merge-failures.mjs";

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
	const body = commentBody(run());
	assert.ok(body.includes(MARKER));
	// Extract the emitted URL and compare it exactly (CodeQL js/incomplete-url-substring-sanitization).
	const emitted = body.match(/https?:\/\/\S+/)?.[0];
	assert.equal(emitted, run().html_url);
	const url = new URL(emitted);
	assert.equal(url.host, "example.test");
	assert.equal(url.pathname, "/runs/1");
});

test("the comment carries the run url it was given, never a look-alike", () => {
	const evil = "https://example.test.attacker/runs/1";
	const emitted = commentBody(run({ html_url: evil })).match(/https?:\/\/\S+/)?.[0];
	assert.equal(emitted, evil);
	assert.notEqual(new URL(emitted).host, "example.test");
	assert.notEqual(emitted, run().html_url);
});

const job = (conclusion) => ({ conclusion });

test("a job that failed or timed out is red", () => {
	assert.equal(redJobs([job("success"), job("failure")]).length, 1);
	assert.equal(redJobs([job("timed_out")]).length, 1);
});

test("a fork run closed by the merge has no jobs, so it is not red", () => {
	assert.deepEqual(redJobs([]), []);
});

test("jobs cancelled by the merge are not red", () => {
	assert.deepEqual(redJobs([job("cancelled"), job("success")]), []);
});

test("a real failure still counts next to cancelled jobs", () => {
	assert.equal(redJobs([job("cancelled"), job("failure")]).length, 1);
});

test("the canonical issue is the oldest one with exactly this title", () => {
	const title = issueTitle(7);
	const issues = [
		{ number: 12, title },
		{ number: 9, title },
		{ number: 3, title: "Merged with red checks: #70" },
	];
	assert.equal(canonicalIssue(issues, title), 9);
	assert.equal(canonicalIssue([], title), null);
});

const merged = { number: 7, title: "a change" };
function fakeIssues(start = []) {
	const log = { issues: [...start], comments: [], closed: [] };
	return {
		log,
		list: () => log.issues,
		comment: (number, body) => log.comments.push({ number, body }),
		create(title) {
			const number = 100 + log.issues.length;
			log.issues.push({ number, title });
			return number;
		},
		close(number, canonical) {
			log.closed.push({ number, canonical });
			log.issues = log.issues.filter((issue) => issue.number !== number);
		},
	};
}

test("the first failing check creates the issue", () => {
	const api = fakeIssues();
	assert.equal(fileIssue(merged, run(), api), 100);
	assert.deepEqual(api.log.comments, []);
	assert.deepEqual(api.log.closed, []);
});

test("a later failing check comments on the existing issue", () => {
	const api = fakeIssues([{ number: 50, title: issueTitle(7) }]);
	assert.equal(fileIssue(merged, run(), api), 50);
	assert.equal(api.log.issues.length, 1);
	assert.equal(api.log.comments[0].number, 50);
	assert.ok(api.log.comments[0].body.includes(run().html_url));
});

test("a reporter that lost the race closes its duplicate and keeps its run on the oldest issue", () => {
	const api = fakeIssues();
	const list = api.list;
	// The first look sees nothing; meanwhile another reporter creates the older issue.
	let looks = 0;
	api.list = () => {
		looks += 1;
		return looks === 1 ? [] : list();
	};
	const create = api.create;
	api.create = (title) => {
		api.log.issues.push({ number: 90, title });
		return create(title);
	};
	assert.equal(fileIssue(merged, run(), api), 90);
	assert.deepEqual(api.log.closed, [{ number: 101, canonical: 90 }]);
	assert.deepEqual(api.log.issues.map((issue) => issue.number), [90]);
	assert.equal(api.log.comments[0].number, 90);
	assert.ok(api.log.comments[0].body.includes(run().html_url));
});
