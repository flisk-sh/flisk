// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the scoreboard runner and the declarations of every scorer. Run by `make test-shell`.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { codeBlocks, maintainerLogins, median, percentile } from "./lib.mjs";
import {
	loadScorers,
	metaProblems,
	nextBaseline,
	readBaseline,
	renderMarkdown,
	runScorers,
	verdict,
} from "./run.mjs";

const higher = { id: "h", mode: "ratchet", better: "higher" };
const lower = { id: "l", mode: "ratchet", better: "lower" };

test("every scorer in scripts/scores declares a valid meta and has a baseline when it is a ratchet", async () => {
	const baseline = readBaseline();
	const scorers = await loadScorers();
	assert.ok(scorers.length > 0);
	assert.deepEqual(scorers.flatMap((s) => metaProblems(s, baseline)), []);
});

test("baseline.json has no entry for a scorer that does not exist or is not a ratchet", async () => {
	const ratchets = (await loadScorers()).filter((s) => s.meta.mode === "ratchet").map((s) => s.meta.id);
	assert.deepEqual(Object.keys(readBaseline()).filter((id) => !ratchets.includes(id)), []);
});

test("a gate passes at its target and fails past it, in the declared direction", () => {
	assert.equal(verdict({ mode: "gate", better: "lower", target: 0 }, 0, {}).status, "pass");
	assert.equal(verdict({ mode: "gate", better: "lower", target: 0 }, 1, {}).status, "fail");
	assert.equal(verdict({ mode: "gate", better: "higher", target: 100 }, 99, {}).status, "fail");
});

test("a ratchet fails only when the value is worse than the baseline, within its tolerance", () => {
	assert.equal(verdict(higher, 50, { h: 50 }).status, "pass");
	assert.equal(verdict(higher, 49, { h: 50 }).status, "fail");
	assert.equal(verdict(lower, 7, { l: 7 }).status, "pass");
	assert.equal(verdict(lower, 8, { l: 7 }).status, "fail");
	assert.equal(verdict({ ...lower, tolerance: 0.1 }, 105, { l: 100 }).status, "pass");
	assert.equal(verdict({ ...lower, tolerance: 0.1 }, 111, { l: 100 }).status, "fail");
	assert.equal(verdict(higher, 50, {}).status, "fail");
});

test("no data skips the row and a report never fails", () => {
	assert.equal(verdict(higher, null, { h: 50 }).status, "skip");
	assert.equal(verdict({ mode: "report", better: "higher" }, 0, {}).status, "report");
});

test("nextBaseline only moves a ratchet in its better direction", () => {
	const rows = [
		{ ...higher, value: 60 },
		{ ...lower, value: 9 },
		{ id: "r", mode: "report", better: "higher", value: 1 },
	];
	assert.deepEqual(nextBaseline(rows, { h: 50, l: 7 }), { h: 60, l: 7 });
	assert.deepEqual(nextBaseline([{ ...lower, value: 3 }], {}), { l: 3 });
});

test("a scorer that throws becomes an error row and the others still run", async () => {
	const rows = await runScorers(
		[
			{ meta: { id: "a", mode: "report", better: "higher" }, measure: () => { throw new Error("gh: not signed in\nmore"); } },
			{ meta: { id: "b", mode: "report", better: "higher" }, measure: () => ({ value: 2 }) },
		],
		{},
		{},
	);
	assert.deepEqual(rows.map((r) => [r.id, r.status, r.reason]), [["a", "error", "gh: not signed in"], ["b", "report", undefined]]);
});

test("markdown lists every row and the findings of a failing one", () => {
	const md = renderMarkdown([
		{ id: "x", title: "X", mode: "gate", value: 2, unit: "violations", status: "fail", reason: "target 0", findings: ["README.md:3 cold boot"] },
	]);
	assert.match(md, /\| `x` X \| 2 violations \| gate \| \*\*fail\*\* \(target 0\) \|/);
	assert.match(md, /- README\.md:3 cold boot/);
});

test("lib helpers: median, nearest-rank percentile and fenced code blocks", () => {
	assert.equal(median([3, 1, 2]), 2);
	assert.equal(median([4, 1, 2, 3]), 2.5);
	assert.equal(median([]), null);
	assert.equal(percentile([1, 2, 3, 4], 75), 3);
	const blocks = codeBlocks("text\n```bash\nflisk up\n```\n~~~\nx\n~~~\n");
	assert.deepEqual(blocks, [
		{ lang: "bash", line: 3, body: "flisk up" },
		{ lang: "", line: 6, body: "x" },
	]);
});

test("maintainerLogins reads the GitHub id column of this repo's MAINTAINERS.md, lower case and without @", () => {
	const logins = maintainerLogins(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
	assert.ok(logins.size > 0);
	for (const login of logins) assert.match(login, /^[a-z0-9-]+$/);
	assert.equal(maintainerLogins("/nonexistent").size, 0);
});
