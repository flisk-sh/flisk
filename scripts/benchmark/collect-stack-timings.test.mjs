// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the stacklytics collector: what a leg's timings become, history, and the coming-soon / no-data labels.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { build, catalog, readTimings, summarize, summaryMarkdown } from "./collect-stack-timings.mjs";

const axes = {
	axes: {
		language: { values: { bun: {}, python: {} } },
		httpFramework: { values: { hono: {}, express: {} } },
		frontendFramework: { values: { react: {}, next: {} } },
		appType: { values: { backend: {}, frontend: {}, worker: {}, database: {} } },
		orm: { values: { prisma: {} } },
		byoVariant: { values: { byo: {} } },
		infraService: { values: { elk: {} } },
	},
};
const rec = (leg, metric, ms, at = "2026-11-12T01:00:00Z") => ({ leg, metric, ms, at });

test("each axis value maps to the leg label the matrix gives it", () => {
	const ids = catalog(axes).stacks.map((s) => s.id);
	assert.deepEqual(ids, ["bun", "python", "bun", "bun-express", "frontend-react", "frontend-next", "worker", "database", "prisma", "bring-your-own-flisk", "infraService:elk"]);
});

test("scaffold is the median of its readings, every other metric is the first reading", () => {
	const s = summarize([rec("worker", "scaffold", 900, "2026-11-12T01:00:03Z"), rec("worker", "scaffold", 100), rec("worker", "scaffold", 300, "2026-11-12T01:00:02Z"), rec("worker", "cold_start", 5000, "2026-11-12T01:00:05Z"), rec("worker", "cold_start", 1, "2026-11-12T01:00:09Z")]);
	assert.deepEqual(s.get("worker"), { scaffold: 300, cold_start: 5000 });
});

test("measured, no-data and coming-soon are told apart", () => {
	const out = build({
		records: [rec("python", "scaffold", 800), rec("python", "cold_start", 30000), rec("combined", "scaffold", 5)],
		axes,
		ran: new Set(["python", "frontend-react"]),
		commit: "abc",
		now: "2026-11-12T03:00:00Z",
	});
	const by = Object.fromEntries(out.stacks.map((s) => [s.id, s]));
	assert.equal(by.python.status, "measured");
	assert.equal(by.python.metrics.cold_start, 30000);
	assert.equal(by.python.metrics.hot_reload, null);
	assert.equal(by["frontend-react"].status, "no-data"); // its leg ran but wrote nothing
	assert.equal(by["frontend-next"].status, "coming-soon"); // its leg did not run
	assert.equal(by["infraService:elk"].status, "coming-soon"); // no leg exists yet
	assert.equal(by.combined.group, "other"); // measured but listed by no axis
	assert.ok(out.groups.some((g) => g.id === "other"));
});

test("history gets one entry a day, keeps older days, and an unmeasured night keeps the last numbers", () => {
	const first = build({ records: [rec("python", "cold_start", 30000)], axes, commit: "a", now: "2026-11-11T03:00:00Z" });
	const second = build({ records: [rec("python", "cold_start", 28000)], axes, previous: first, commit: "b", now: "2026-11-12T03:00:00Z" });
	const rerun = build({ records: [rec("python", "cold_start", 27000)], axes, previous: second, commit: "c", now: "2026-11-12T09:00:00Z" });
	assert.deepEqual(rerun.stacks.find((s) => s.id === "python").history.map((h) => [h.date, h.cold_start, h.commit]), [
		["2026-11-11", 30000, "a"],
		["2026-11-12", 27000, "c"],
	]);
	const skipped = build({ records: [], axes, previous: rerun, commit: "d", now: "2026-11-13T03:00:00Z" });
	const python = skipped.stacks.find((s) => s.id === "python");
	assert.equal(python.status, "measured");
	assert.equal(python.metrics.cold_start, 27000);
	assert.equal(python.history.length, 2);
});

test("reads every timings.jsonl under a directory and skips bad lines", () => {
	const dir = mkdtempSync(path.join(tmpdir(), "timings-"));
	mkdirSync(path.join(dir, "stack-timings-python"));
	writeFileSync(path.join(dir, "stack-timings-python", "timings.jsonl"), `${JSON.stringify(rec("python", "scaffold", 5))}\nnot json\n${JSON.stringify({ leg: "x", metric: "scaffold", ms: -1 })}\n`);
	assert.equal(readTimings(dir).length, 1);
	assert.equal(readTimings(path.join(dir, "missing")).length, 0);
	assert.ok(readFileSync(path.join(dir, "stack-timings-python", "timings.jsonl"), "utf8").includes("scaffold"));
});

test("the real axes.json lists the stacks the page needs", () => {
	const real = JSON.parse(readFileSync(new URL("../../tests/e2e/axes.json", import.meta.url), "utf8"));
	const ids = catalog(real).stacks.map((s) => s.id);
	for (const id of ["bun", "python", "go", "rust", "node", "frontend-react", "frontend-next", "bun-express", "prisma", "bring-your-own-flisk", "mcp"]) assert.ok(ids.includes(id), id);
});

test("the job summary lists the stacks that ran and counts the rest", () => {
	const out = build({ records: [rec("python", "scaffold", 800), rec("python", "listed", 1200), rec("python", "warm_start", 4100)], axes, commit: "abcdef123", trigger: "pull_request", now: "2026-11-12T03:00:00Z" });
	const md = summaryMarkdown(out);
	assert.match(md, /\| python \| 800 ms \| 1\.2 s \| 4\.1 s \|/); // cold start falls back to listed
	assert.match(md, /Commit `abcdef1`/);
	assert.match(md, /\d+ more stacks are listed as coming soon/);
	assert.ok(!md.includes("infraService"));
});

test("bring-your-own axis values map to the legs that run them through flisk up", () => {
	const byo = { axes: { byoVariant: { values: { byo: {}, "byo-jobs": {}, "byo-pair": {} } } } };
	assert.deepEqual(catalog(byo).stacks.map((s) => s.id), ["bring-your-own-flisk", "bring-your-own-job", "bring-your-own-pair"]);
});
