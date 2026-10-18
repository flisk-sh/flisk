// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/red-job-tracker.mjs. Run by `make test-shell`.
import assert from "node:assert/strict";
import test from "node:test";
import { decide, lastErrorLine } from "./red-job-tracker.mjs";

const run = (conclusion, extra = {}) => ({
	databaseId: Math.floor(Math.random() * 1e9),
	status: "completed",
	conclusion,
	event: "schedule",
	url: `https://example.test/runs/${conclusion}`,
	createdAt: "2026-10-01T00:00:00Z",
	...extra,
});

test("three failures in a row on main are red, with the oldest of them as the first failing run", () => {
	const runs = [
		run("failure", { url: "newest" }),
		run("failure"),
		run("failure", { url: "oldest-of-streak" }),
		run("success"),
	];
	const result = decide(runs);
	assert.equal(result.state, "red");
	assert.equal(result.firstFailing.url, "oldest-of-streak");
});

test("three passes in a row are green", () => {
	assert.equal(
		decide([run("success"), run("success"), run("success")]).state,
		"green",
	);
});

test("a mix in the last three runs is mixed, and two failures are not enough", () => {
	assert.equal(
		decide([run("failure"), run("success"), run("failure")]).state,
		"mixed",
	);
	assert.equal(decide([run("failure"), run("failure")]).state, "unknown");
});

test("pull request, cancelled and in-progress runs do not count", () => {
	const runs = [
		run("failure"),
		run("failure", { event: "pull_request" }),
		run("cancelled"),
		run("failure", { status: "in_progress", conclusion: "" }),
		run("failure"),
		run("failure"),
	];
	assert.equal(decide(runs).state, "red");
	assert.equal(
		decide([
			run("failure"),
			run("failure", { event: "pull_request" }),
			run("failure"),
		]).state,
		"unknown",
	);
});

test("the last error line is the last line that names an error, without log prefixes", () => {
	const log = [
		"cold-start\tStep one\t2026-10-01T00:00:00Z ##[group]Run make",
		"cold-start\tStep one\t2026-10-01T00:00:01Z Installing deps",
		"cold-start\tStep one\t2026-10-01T00:00:02Z ##[error]Configure the TDK_LICENSE_KEY secret",
		"cold-start\tStep one\t2026-10-01T00:00:03Z ##[endgroup]",
	].join("\n");
	assert.equal(
		lastErrorLine(log),
		"##[error]Configure the TDK_LICENSE_KEY secret",
	);
});

test("a log with no error line falls back to its last line", () => {
	assert.equal(
		lastErrorLine("job\tstep\t2026 one\njob\tstep\t2026 two"),
		"2026 two",
	);
	assert.equal(lastErrorLine(""), "no log output");
});

test("GitHub's generic exit-code line is not reported as the error; the real error above it is", () => {
	const log = [
		"cold-start\tStep one\t2026-10-01T00:00:00Z ##[error]Error: TDK_LICENSE_KEY does not grant sablier",
		"cold-start\tStep one\t2026-10-01T00:00:01Z ##[error]Process completed with exit code 1.",
	].join("\n");
	assert.equal(
		lastErrorLine(log),
		"##[error]Error: TDK_LICENSE_KEY does not grant sablier",
	);
});
