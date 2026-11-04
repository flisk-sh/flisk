// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the competitor-coverage scorer, on fixture data, plus a check that the committed matrices are clean.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dataProblems, iceScore, loadAll } from "../competitors/lib.mjs";
import { meta, measure } from "./competitor-coverage.mjs";
import { commandTree } from "./lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NOW = new Date("2026-11-01T00:00:00Z");
const ice = { impact: 8, confidence: 8, ease: 8, basis: "one file to touch" };

const mk = (id, status, extra = {}) => ({
	id,
	area: "runtime",
	offer: "Does a thing.",
	source: "https://example.com/p",
	checked: "2026-10-27",
	match: [id],
	flisk: {
		status,
		scope: status === "out-of-scope" ? "out" : "in",
		...(status === "covered" ? {} : { reason: "because" }),
		evidence: ["covered", "partial"].includes(status) ? [{ file: "README.md" }] : [],
	},
	...(status === "missing" ? { acceptance: "a test", ice } : {}),
	...extra,
});

function fixture(competitors) {
	const root = mkdtempSync(path.join(tmpdir(), "cov-"));
	mkdirSync(path.join(root, "docs/competitors"), { recursive: true });
	writeFileSync(path.join(root, "README.md"), "# hi flisk\n");
	const put = (f, v) => writeFileSync(path.join(root, "docs/competitors", f), JSON.stringify(v));
	put("index.json", { areas: ["runtime"], competitors: competitors.map((c) => ({ id: c.id, name: c.id, url: "https://x.example/", category: "orchestrator", why: "w", watch: [] })) });
	for (const c of competitors) put(`${c.id}.json`, { competitor: c.id, rows: c.rows });
	return root;
}

test("meta is a files ratchet in percent", () => {
	assert.deepEqual([meta.source, meta.mode, meta.better, meta.unit], ["files", "ratchet", "higher", "%"]);
});

test("value is (covered + half partial) / in-scope rows; out-of-scope rows do not count", async () => {
	const root = fixture([{ id: "a", rows: [mk("c", "covered"), mk("p", "partial"), mk("m", "missing"), mk("o", "out-of-scope")] }]);
	const r = await measure({ root, now: NOW });
	assert.equal(r.value, 50);
	assert.match(r.summary, /a 50% \(1 covered, 1 partial, 1 missing, 1 out-of-scope\)/);
	assert.equal(r.findings[0], "a/runtime/m: a Does a thing.");
	assert.equal(r.findings.length, 1);
});

test("the value is the mean over competitors", async () => {
	const root = fixture([
		{ id: "a", rows: [mk("c", "covered")] },
		{ id: "b", rows: [mk("m", "missing")] },
	]);
	assert.equal((await measure({ root, now: NOW })).value, 50);
});

test("a stale evidence claim is a finding", async () => {
	const bad = mk("c", "covered");
	bad.flisk.evidence = [{ file: "nope.txt" }, { text: { file: "README.md", contains: "absent words" } }];
	const root = fixture([{ id: "a", rows: [bad] }]);
	const r = await measure({ root, now: NOW });
	assert.ok(r.findings.some((f) => /stale claim: file nope\.txt does not exist/.test(f)));
	assert.ok(r.findings.some((f) => /stale claim: README\.md no longer contains/.test(f)));
});

test("data problems: source, date, age, reason, ids, ice, acceptance", async () => {
	const rows = [
		mk("old", "covered", { checked: "2026-05-01" }),
		mk("nosrc", "covered", { source: "not a url" }),
		mk("nodate", "covered", { checked: "yesterday" }),
		mk("dup", "covered"),
		mk("dup", "covered"),
		{ ...mk("noreason", "out-of-scope"), flisk: { status: "out-of-scope", scope: "out" } },
		{ ...mk("noscore", "missing"), ice: undefined },
		{ ...mk("badice", "missing"), ice: { impact: 0, confidence: 5, ease: 5, basis: "out of range" } },
		{ ...mk("noacc", "missing"), acceptance: undefined },
		{ ...mk("nomatch", "covered"), match: ["Upper"] },
	];
	const root = fixture([{ id: "a", rows }]);
	const { competitors, index } = loadAll(root);
	const text = (await dataProblems(root, competitors[0], index.areas, NOW, null)).join("\n");
	for (const re of [/old: source not re-checked since 2026-05-01/, /nosrc: source must be a URL/, /nodate: checked must be/, /dup: duplicate id/, /noreason: a out-of-scope row needs a reason/, /noscore: ice is missing/, /badice: ice\.impact must be an integer from 1 to 10/, /noacc: a missing in-scope row needs an acceptance check/, /nomatch: match needs lower-case/])
		assert.match(text, re);
});

test("ICE score is the mean of the three numbers, one decimal; invalid is null", () => {
	assert.equal(iceScore({ impact: 7, confidence: 7, ease: 8, basis: "enough words here" }), 7.3);
	assert.equal(iceScore({ impact: 7, confidence: 7, basis: "enough words here" }), null);
});

test("no in-scope row anywhere gives no data", async () => {
	const root = fixture([{ id: "a", rows: [mk("o", "out-of-scope")] }]);
	assert.equal((await measure({ root, now: NOW })).value, null);
});

test("the committed matrices have no data problems", async () => {
	const { competitors, index } = loadAll(repoRoot);
	const tree = await commandTree(repoRoot);
	const problems = [];
	for (const c of competitors) problems.push(...(await dataProblems(repoRoot, c, index.areas, new Date("2026-11-15T00:00:00Z"), tree)));
	assert.deepEqual(problems, []);
});
