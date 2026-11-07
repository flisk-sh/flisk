// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/nightly-adopter-issues.mjs. Run by `make test-shell`.
import assert from "node:assert/strict";
import test from "node:test";
import {
	closeBody,
	commentBody,
	decide,
	errorMessages,
	failedStep,
	issueBody,
	issueTitle,
	isTransient,
	MARKER,
	parseAdopterJob,
} from "./nightly-adopter-issues.mjs";

const job = (extra = {}) => ({
	id: 1,
	name: "Lychee (LycheeOrg/Lychee)",
	conclusion: "failure",
	html_url: "https://example.test/job/1",
	steps: [
		{ name: "Flisk Up with Readiness Wait", conclusion: "success" },
		{ name: "Smoke Route Health Check", conclusion: "failure" },
		{ name: "Collect Failure Evidence", conclusion: "success" },
	],
	...extra,
});

test("matrix job names parse into adopter name and repository", () => {
	assert.deepEqual(parseAdopterJob("Lychee (LycheeOrg/Lychee)"), {
		name: "Lychee",
		repo: "LycheeOrg/Lychee",
	});
	assert.deepEqual(parseAdopterJob("Nosia (dilolabs/nosia)"), {
		name: "Nosia",
		repo: "dilolabs/nosia",
	});
});

test("non-adopter jobs are ignored", () => {
	for (const name of [
		"Report adopter failures",
		"",
		undefined,
		"Lychee (not a repo)",
	])
		assert.equal(parseAdopterJob(name), null);
});

test("title is stable per adopter so reruns find the same issue", () => {
	assert.equal(
		issueTitle({ name: "Nosia", repo: "dilolabs/nosia" }),
		"Nightly adopter failing: Nosia (dilolabs/nosia)",
	);
});

test("the first failed step is named", () => {
	assert.equal(failedStep(job()), "Smoke Route Health Check");
	assert.equal(failedStep(job({ steps: [] })), null);
	assert.equal(failedStep(job({ steps: undefined })), null);
});

test("only failure annotations are kept, without the generic exit-code line or duplicates", () => {
	const errors = errorMessages([
		{
			annotation_level: "failure",
			message: "Process completed with exit code 1.",
		},
		{
			annotation_level: "failure",
			message: "Target http://127.0.0.1:80 did not answer",
		},
		{
			annotation_level: "failure",
			message: "Target http://127.0.0.1:80 did not answer",
		},
		{ annotation_level: "warning", message: "evidence collection failed" },
	]);
	assert.deepEqual(errors, ["Target http://127.0.0.1:80 did not answer"]);
	assert.deepEqual(errorMessages(undefined), []);
});

test("failed jobs create or comment, passing jobs close an open issue, everything else is left alone", () => {
	assert.equal(decide(job(), null), "create");
	assert.equal(decide(job(), 12), "comment");
	assert.equal(decide(job({ conclusion: "timed_out" }), null), "create");
	assert.equal(decide(job({ conclusion: "success" }), 12), "close");
	assert.equal(decide(job({ conclusion: "success" }), null), "none");
	assert.equal(decide(job({ conclusion: "cancelled" }), 12), "none");
	assert.equal(decide(job({ conclusion: "skipped" }), null), "none");
});

test("bodies carry the marker, run link, failed step and errors", () => {
	const run = "https://example.test/runs/9";
	const body = issueBody(
		{ name: "Lychee", repo: "LycheeOrg/Lychee" },
		job(),
		run,
		["boom"],
	);
	assert.ok(body.startsWith(MARKER));
	assert.equal(runUrl(body), run);
	assert.ok(body.includes("`Smoke Route Health Check`"));
	assert.ok(body.includes("boom"));
	const comment = commentBody(job(), run, []);
	assert.ok(comment.startsWith(MARKER));
	assert.equal(runUrl(comment), run);
	assert.ok(!comment.includes("Errors:"));
	assert.equal(closeBody(run).match(/https?:\/\/\S+?(?=\.?\s|\.?$)/)?.[0], run);
});

// Extract the emitted run URL and compare it exactly, not by substring (CodeQL js/incomplete-url-substring-sanitization).
function runUrl(text) {
	return text.match(/^- Run: (\S+)$/m)?.[1];
}

test("only rate limits and server errors are retried", () => {
	assert.equal(isTransient("gh: Bad Gateway (HTTP 502)"), true);
	assert.equal(isTransient("gh: API rate limit exceeded (HTTP 429)"), true);
	assert.equal(isTransient("gh: Not Found (HTTP 404)"), false);
	assert.equal(isTransient("gh: Validation Failed (HTTP 422)"), false);
	assert.equal(isTransient(undefined), false);
});
