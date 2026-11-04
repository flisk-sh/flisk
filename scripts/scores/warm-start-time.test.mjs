// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the warm-start-time scorer, on fixture repos with committed benchmark folders.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { benchmarks, measure, RESULTS } from "./warm-start-time.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function fixture(files) {
	const root = mkdtempSync(path.join(tmpdir(), "warm-start-time-"));
	for (const [rel, body] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		writeFileSync(path.join(root, rel), typeof body === "string" ? body : JSON.stringify(body));
	}
	return root;
}

const ENV = {
	flisk: "1.4.0",
	os: "Linux 6.8 x86_64",
	cpus: "4",
	memory_bytes: "8589934592",
	project: "shop",
	healthy_expected: "5",
};
const run = (name, kind, wallSeconds, outcome = "settled") => ({
	name,
	kind,
	wallSeconds,
	outcome,
	healthySeen: 5,
	healthyExpected: 5,
});
const summary = (runs, environment = ENV) => ({ environment, runs });

test("the newest dated folder with a summary.json is used; a newer one without it is a finding", () => {
	const root = fixture({
		[`${RESULTS}/flisk-up-warm-start-2026-09-01/summary.json`]: summary([run("warm-1", "warm", 99)]),
		[`${RESULTS}/flisk-up-warm-start-2026-10-02/summary.json`]: summary([
			run("cold-1", "cold", 300),
			run("warm-1", "warm", 50),
			run("warm-2", "warm", 38),
			run("warm-3", "warm", 41),
			run("warm-4", "warm", 40),
			run("warm-5", "warm", 1800, "timeout"),
		]),
		[`${RESULTS}/tdk-up-warm-start-2026-10-05/README.md`]: "measured by hand, no wall time\n",
		// Not warm-start benchmarks: another benchmark's file and folder, and a folder without a date.
		[`${RESULTS}/container-scale-2026-12-01T10-00-00Z.json`]: "{}",
		[`${RESULTS}/cli-startup-2026-12-01/summary.json`]: summary([run("warm-1", "warm", 1)]),
		[`${RESULTS}/flisk-up-warm-start-latest/summary.json`]: summary([run("warm-1", "warm", 1)]),
	});
	try {
		assert.deepEqual(
			benchmarks(root).map((b) => [b.date, b.hasSummary]),
			[
				["2026-10-05", false],
				["2026-10-02", true],
				["2026-09-01", true],
			],
		);
		const result = measure({ root, now: new Date("2026-10-27T12:00:00Z") });
		// The settled warm runs 38, 40, 41, 50: the median of an even count is the mean of the middle two.
		assert.equal(result.value, 40.5);
		assert.equal(
			result.summary,
			"shop, 4 warm runs, cold 300 s, flisk 1.4.0, Linux 6.8 x86_64, 4 CPUs, benchmark of 2026-10-02, 25 days old",
		);
		assert.deepEqual(result.findings, [
			`${RESULTS}/tdk-up-warm-start-2026-10-05: no summary.json, so ${RESULTS}/flisk-up-warm-start-2026-10-02 is used`,
			`${RESULTS}/flisk-up-warm-start-2026-10-02/warm-5: warm run timeout, not timed`,
		]);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("a newest benchmark without a settled warm run is no data, not an older number", () => {
	const root = fixture({
		[`${RESULTS}/flisk-up-warm-start-2026-09-01/summary.json`]: summary([run("warm-1", "warm", 30)]),
		[`${RESULTS}/flisk-up-warm-start-2026-10-01/summary.json`]: summary(
			[run("cold-1", "cold", null, "cleanup_failed"), run("warm-1", "warm", 1800, "timeout")],
			{},
		),
	});
	try {
		const result = measure({ root });
		assert.equal(result.value, null);
		assert.equal(
			result.summary,
			"no settled warm run: unknown project, 0 warm runs, no settled cold run, flisk ?, unknown OS, ? CPUs, benchmark of 2026-10-01",
		);
		assert.deepEqual(result.findings, [
			`${RESULTS}/flisk-up-warm-start-2026-10-01/cold-1: cold run cleanup_failed, not timed`,
			`${RESULTS}/flisk-up-warm-start-2026-10-01/warm-1: warm run timeout, not timed`,
		]);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("no benchmark folder is no data, and a summary.json that does not parse is an error", () => {
	const none = fixture({ "README.md": "" });
	const bad = fixture({ [`${RESULTS}/flisk-up-warm-start-2026-10-01/summary.json`]: "{ not json" });
	try {
		assert.equal(measure({ root: none }).value, null);
		assert.throws(() => measure({ root: bad }), /summary\.json does not parse/);
	} finally {
		rmSync(none, { recursive: true });
		rmSync(bad, { recursive: true });
	}
});

test("this repository: the committed benchmark has the fields and values the scorer reads", () => {
	const result = measure({ root: repoRoot, now: new Date("2026-10-27T00:00:00Z") });
	assert.equal(typeof result.value, "number");
	assert.match(result.summary, /\d+ warm runs, .*benchmark of \d{4}-\d{2}-\d{2}/);
	assert.doesNotMatch(result.summary, /unknown project|flisk \?|unknown OS/);
});
