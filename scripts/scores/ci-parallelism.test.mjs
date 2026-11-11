// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { measure, runParallelism } from "./ci-parallelism.mjs";

const job = (name, start, end, conclusion = "success") => ({
	name,
	startedAt: start === null ? null : `2026-11-10T21:${start}Z`,
	completedAt: end === null ? null : `2026-11-10T21:${end}Z`,
	conclusion,
});

test("legs that all start together give span/longest 1.0", () => {
	const p = runParallelism([
		job("a", "00:00", "03:00"),
		job("b", "00:00", "02:00"),
	]);
	assert.deepEqual(p, {
		legs: 2,
		sum: 300,
		longest: 180,
		span: 180,
		spanOverLongest: 1,
		average: 1.7,
	});
});

test("a staircase of legs shows a long span", () => {
	const p = runParallelism([
		job("a", "00:00", "03:00"),
		job("b", "03:00", "06:00"),
		job("c", "06:00", "09:00"),
	]);
	assert.equal(p.spanOverLongest, 3);
	assert.equal(p.average, 1);
});

test("plan, gate, skipped and unfinished jobs are not legs", () => {
	const p = runParallelism(
		[
			job("plan", "00:00", "00:30"),
			job("a", "01:00", "02:00"),
			job("gate", "02:00", "02:10"),
			job("s", "01:00", "01:01", "skipped"),
			job("u", "01:00", null),
		],
		["plan", "gate"],
	);
	assert.equal(p.legs, 1);
	assert.equal(p.span, 60);
});

test("no legs gives null", () => {
	assert.equal(runParallelism([job("plan", "00:00", "00:30")], ["plan"]), null);
});

test("measure takes the median and lists runs over the target", () => {
	const jobsById = {
		1: [job("a", "00:00", "03:00"), job("b", "00:00", "03:00")],
		2: [job("a", "00:00", "03:00"), job("b", "03:00", "06:00")],
	};
	const gh = (args) => {
		if (args[0] === "run" && args[1] === "list")
			return [{ databaseId: 1 }, { databaseId: 2 }];
		return { jobs: jobsById[args[2]] };
	};
	const r = measure({ repo: "o/r", gh });
	assert.equal(r.value, 1.5);
	assert.match(r.summary, /n=4 runs, 2 over 1.3x/);
	assert.equal(r.findings.length, 2);
	assert.match(r.findings[0], /span\/longest 2x/);
});

test("measure with no runs reports no data", () => {
	const r = measure({ repo: "o/r", gh: () => [] });
	assert.equal(r.value, null);
});
