// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/ci-report.mjs. Run by `make test-shell`.
import assert from "node:assert/strict";
import test from "node:test";
import {
	aggregate,
	flakyCommits,
	mapPool,
	overBudget,
	percentile,
	prAggregates,
	render,
} from "./ci-report.mjs";

const row = (
	conclusion,
	seconds,
	sha = "a",
	workflow = "ci.yml",
	name = "Test",
) => ({ workflow, name, conclusion, seconds, sha });

test("percentile uses the nearest rank and is null for an empty list", () => {
	assert.equal(percentile([], 90), null);
	assert.equal(percentile([5], 90), 5);
	const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
	assert.equal(percentile(ten, 50), 5);
	assert.equal(percentile(ten, 90), 9);
	assert.equal(percentile(ten, 100), 10);
});

test("aggregate counts rates over all runs and durations over runs that finished", () => {
	const [s] = aggregate([
		row("success", 10),
		row("success", 30),
		row("failure", 20),
		row("cancelled", 5),
		row("skipped", 0),
	]);
	assert.equal(s.runs, 5);
	assert.equal(s.failure, 0.2);
	assert.equal(s.cancelled, 0.2);
	assert.equal(s.skipped, 0.2);
	assert.equal(s.p50, 20);
	assert.equal(s.p90, 30);
});

test("jobs of different workflows with the same name stay separate", () => {
	const stats = aggregate([
		row("success", 1, "a", "ci.yml", "build"),
		row("success", 1, "a", "release.yml", "build"),
	]);
	assert.equal(stats.length, 2);
});

test("a flaky case is a commit where the job both failed and passed", () => {
	assert.equal(
		flakyCommits([
			row("failure", 1, "x"),
			row("success", 1, "x"),
			row("success", 1, "y"),
			row("failure", 1, "z"),
		]),
		1,
	);
	assert.equal(flakyCommits([row("success", 1, "x")]), 0);
});

test("only gate and test jobs over their p90 budget are flagged", () => {
	const stats = [
		{ workflow: "ci.yml", name: "Lint", p90: 200 },
		{ workflow: "ci.yml", name: "Test", p90: 500 },
		{ workflow: "ci.yml", name: "Slow test", p90: 700 },
		{ workflow: "agent.yml", name: "e2e", p90: 5000 },
		{ workflow: "ci.yml", name: "Idle", p90: null },
	];
	const tier = {
		Lint: "gate",
		Test: "test",
		"Slow test": "test",
		e2e: "e2e",
		Idle: "gate",
	};
	const flagged = overBudget(stats, (_w, n) => tier[n]).map((o) => o.name);
	assert.deepEqual(flagged, ["Lint", "Slow test"]);
});

test("pull request aggregates split by whether e2e suites ran", () => {
	const agg = prAggregates([
		{ seconds: 100, e2e: false },
		{ seconds: 200, e2e: false },
		{ seconds: 1000, e2e: true },
		{ seconds: Number.NaN, e2e: true },
	]);
	assert.equal(agg.withoutE2e.runs, 2);
	assert.equal(agg.withE2e.runs, 1);
	assert.equal(agg.withE2e.p90, 1000);
});

const emptyAgg = {
	withE2e: { runs: 0, p50: null, p90: null },
	withoutE2e: { runs: 0, p50: null, p90: null },
};

test("the report states that nothing is over budget when that is true", () => {
	const text = render({
		days: 7,
		sampled: 1,
		totalRuns: 2,
		stats: [],
		over: [],
		prAgg: emptyAgg,
		tierOf: () => undefined,
	});
	assert.match(
		text,
		/No job or pull request aggregate is over its tier's budget/,
	);
});

test("the report names a job and a pull request aggregate that are over budget", () => {
	const over = [
		{ workflow: "ci.yml", name: "Lint", tier: "gate", p90: 240, budget: 180 },
	];
	const prAgg = {
		withE2e: { runs: 1, p50: 2000, p90: 2000 },
		withoutE2e: { runs: 0, p50: null, p90: null },
	};
	const text = render({
		days: 7,
		sampled: 1,
		totalRuns: 2,
		stats: [],
		over,
		prAgg,
		tierOf: () => undefined,
	});
	assert.match(text, /ci\.yml` Lint \(gate\): p90 4\.0m, budget 3\.0m/);
	assert.match(text, /PR aggregate with e2e: p90 33\.3m over 25\.0m/);
});

test("mapPool keeps order, bounds concurrency and turns failures into null", async () => {
	let inFlight = 0;
	let peak = 0;
	const out = await mapPool([1, 2, 3, 4, 5, 6], 2, async (n) => {
		inFlight += 1;
		peak = Math.max(peak, inFlight);
		await new Promise((r) => setTimeout(r, 5));
		inFlight -= 1;
		if (n === 3) throw new Error("boom");
		return n * 10;
	});
	assert.deepEqual(out, [10, 20, null, 40, 50, 60]);
	assert.ok(peak <= 2);
});
