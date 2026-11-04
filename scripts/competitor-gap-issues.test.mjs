// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/competitor-gap-issues.mjs and the data it reads (form, labels).
//   node --test scripts/competitor-gap-issues.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BASE_LABELS, bodyFor, FORM, labelsFor, labelsToCreate, markerFor, plan, run, titleFor } from "./competitor-gap-issues.mjs";
import { formFields } from "./scores/lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readRoot = (rel) => readFileSync(path.join(root, rel), "utf8");

const row = (id, ice = { impact: 8, confidence: 8, ease: 8, basis: "small change in one file" }, status = "missing") => ({
	id,
	name: `Feature ${id}`,
	area: "runtime",
	offer: "It does a thing.",
	source: "https://example.com/doc",
	checked: "2026-10-27",
	match: [id],
	acceptance: "flisk doctor reports it",
	...(status === "missing" ? { ice } : {}),
	flisk: { status, scope: status === "out-of-scope" ? "out" : "in", reason: "may fit", evidence: [] },
});
const comp = (id, rows) => ({ id, name: id.toUpperCase(), url: `https://${id}.example.com/`, rows });
const issue = (c, r, state = "OPEN", number = 1) => ({ number, title: "t", state, body: `${markerFor(c, r)}\nbody` });

test("a row on the bar is raised, a row below it is not", () => {
	const onBar = row("on", { impact: 7, confidence: 7, ease: 7, basis: "exactly on the bar" });
	const below = row("below", { impact: 7, confidence: 7, ease: 6, basis: "ease under the bar" });
	const p = plan([comp("a", [onBar, below])], []);
	assert.deepEqual(p.create.map((c) => c.row.id), ["on"]);
	assert.deepEqual(p.belowBar.map((c) => c.at), ["a/runtime/below"]);
});

test("a quick win needs ease even when the mean is high", () => {
	const hard = row("hard", { impact: 10, confidence: 10, ease: 6, basis: "great but hard to do" });
	const p = plan([comp("a", [hard])], []);
	assert.equal(p.create.length, 0);
	assert.equal(p.belowBar.length, 1);
});

test("a high ease does not rescue a low mean", () => {
	const p = plan([comp("a", [row("meh", { impact: 2, confidence: 5, ease: 9, basis: "easy but small" })])], []);
	assert.equal(p.create.length, 0);
});

test("--min-ice and --min-ease override the constants", () => {
	const r = row("x", { impact: 5, confidence: 5, ease: 5, basis: "middling everywhere" });
	assert.equal(plan([comp("a", [r])], []).create.length, 0);
	assert.equal(plan([comp("a", [r])], [], { minIce: 5, minEase: 5 }).create.length, 1);
});

test("missing or invalid ice is never raised", () => {
	const none = { ...row("none"), ice: undefined };
	const bad = row("bad", { impact: 11, confidence: 8, ease: 8, basis: "out of range" });
	const p = plan([comp("a", [none, bad])], []);
	assert.equal(p.create.length, 0);
	assert.equal(p.belowBar.length, 2);
});

test("at most max-new issues per run across all competitors", () => {
	const rows = (c) => [1, 2, 3, 4].map((n) => row(`${c}${n}`));
	const p = plan([comp("a", rows("a")), comp("b", rows("b"))], []);
	assert.equal(p.create.length, 5);
	assert.equal(p.deferred.length, 3);
	assert.equal(plan([comp("a", rows("a"))], [], { maxNew: 2 }).create.length, 2);
});

test("an issue a maintainer closed is never reopened or recreated", () => {
	const p = plan([comp("a", [row("x")])], [issue("a", "x", "CLOSED", 7)]);
	assert.equal(p.create.length, 0);
	assert.equal(p.close.length, 0);
	assert.deepEqual(p.leftClosed.map((c) => c.number), [7]);
});

test("an open issue is kept even when its score dropped, and issues without the marker are ignored", () => {
	const low = row("x", { impact: 3, confidence: 3, ease: 3, basis: "score dropped since" });
	const stranger = { number: 9, title: titleFor(comp("a", []), low), state: "OPEN", body: "hand written" };
	const p = plan([comp("a", [low])], [issue("a", "x"), stranger]);
	assert.equal(p.close.length, 0);
	assert.equal(p.create.length, 0);
	assert.deepEqual(p.keptOpenBelowBar.map((c) => c.number), [1]);
	assert.equal(p.ignored, 1);
});

test("an open issue closes when its row is covered, out-of-scope or gone; partial leaves it open", () => {
	const covered = row("c", undefined, "covered");
	const out = row("o", undefined, "out-of-scope");
	const part = row("p", undefined, "partial");
	const p = plan(
		[comp("a", [covered, out, part])],
		[issue("a", "c", "OPEN", 1), issue("a", "o", "OPEN", 2), issue("a", "p", "OPEN", 3), issue("a", "gone", "OPEN", 4), issue("a", "c", "CLOSED", 5)],
	);
	assert.deepEqual(p.close.map((c) => [c.number, c.reason]).sort(), [[1, "completed"], [2, "not planned"], [4, "not planned"]]);
});

function fakeGh({ issues = [], labels = ["enhancement"], types = [{ name: "Feature", is_enabled: true }] } = {}) {
	const calls = [];
	const exec = (args, input) => {
		calls.push({ args, input });
		if (args[0] === "issue" && args[1] === "list") return JSON.stringify(issues);
		if (args[0] === "label" && args[1] === "list") return JSON.stringify(labels.map((name) => ({ name })));
		if (args[0] === "api" && args[1].startsWith("orgs/")) {
			if (!types) throw new Error("404");
			return JSON.stringify(types);
		}
		return "";
	};
	return { exec, calls };
}
const isWrite = (c) =>
	(c.args[0] === "issue" && c.args[1] !== "list") ||
	(c.args[0] === "label" && c.args[1] !== "list") ||
	(c.args[0] === "api" && c.args.includes("POST"));

// A tiny repo of data for run(): one raised gap and one below the bar.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
function dataRoot() {
	const dir = mkdtempSync(path.join(tmpdir(), "gap-"));
	mkdirSync(path.join(dir, "docs/competitors"), { recursive: true });
	const w = (f, v) => writeFileSync(path.join(dir, "docs/competitors", f), JSON.stringify(v));
	w("index.json", { areas: ["runtime"], competitors: [{ id: "a", name: "A", url: "https://a.example.com/", category: "orchestrator", why: "w", watch: [] }] });
	w("a.json", { competitor: "a", rows: [row("good"), row("poor", { impact: 3, confidence: 3, ease: 3, basis: "low everything" })] });
	w("labels.json", JSON.parse(readRoot("docs/competitors/labels.json")).concat([{ name: "competitor: a", color: "c5def5", description: "a" }, { name: "area: runtime", color: "1d76db", description: "r" }]));
	return dir;
}

test("DRY RUN IS THE DEFAULT: without --apply nothing is written", async () => {
	const { exec, calls } = fakeGh();
	const lines = [];
	await run([], { root: dataRoot(), run: exec, log: (l) => lines.push(l) });
	assert.equal(calls.filter(isWrite).length, 0);
	assert.match(lines.join("\n"), /DRY RUN/);
	assert.match(lines.join("\n"), /would open feat: Feature good \(A has it\)/);
	assert.match(lines.join("\n"), /would create label "needs-triage"/);
	assert.doesNotMatch(lines.join("\n"), /would create label "enhancement"/);
});

test("--apply opens the issue with marker, labels and type, and creates only missing labels", async () => {
	const { exec, calls } = fakeGh();
	await run(["--apply"], { root: dataRoot(), run: exec, log: () => {} });
	const post = calls.find((c) => c.args.includes("POST"));
	const payload = JSON.parse(post.input);
	assert.equal(payload.type, "Feature");
	assert.ok(payload.body.startsWith(markerFor("a", "good")));
	assert.deepEqual(payload.labels, [...BASE_LABELS, "competitor: a", "area: runtime"]);
	const created = calls.filter((c) => c.args[0] === "label" && c.args[1] === "create").map((c) => c.args[2]);
	assert.ok(created.includes("needs-triage") && !created.includes("enhancement"));
	assert.equal(calls.filter((c) => c.args.includes("POST")).length, 1);
});

test("without org issue types the issue is created with labels only", async () => {
	const { exec, calls } = fakeGh({ types: null });
	await run(["--apply"], { root: dataRoot(), run: exec, log: () => {} });
	assert.equal("type" in JSON.parse(calls.find((c) => c.args.includes("POST")).input), false);
});

test("run is idempotent: an existing open issue is not created again", async () => {
	const { exec, calls } = fakeGh({ issues: [issue("a", "good")] });
	await run(["--apply"], { root: dataRoot(), run: exec, log: () => {} });
	assert.equal(calls.filter(isWrite).length, 0);
});

test("labelsToCreate never re-creates an existing label (case-insensitive)", () => {
	const c = comp("a", [row("x")]);
	const defs = Object.fromEntries(JSON.parse(readRoot("docs/competitors/labels.json")).map((l) => [l.name, l]));
	const names = labelsToCreate([{ competitor: c, row: c.rows[0] }], ["Competitor-Gap"], defs).map((l) => l.name);
	assert.ok(!names.includes("competitor-gap") && names.includes("quick-win"));
});

test("the issue body has the headings of the issue form, in order", () => {
	const form = readRoot(".github/ISSUE_TEMPLATE/competitor-gap.yml");
	const labels = [...form.matchAll(/^\s+label: (.+)$/gm)].map((m) => m[1]);
	assert.deepEqual(labels, Object.values(FORM));
	const c = comp("a", [row("x")]);
	assert.deepEqual(Object.keys(formFields(bodyFor(c, c.rows[0]))), labels);
});

test("the form dropdowns match index.json, and every competitor and area has a label", () => {
	const index = JSON.parse(readRoot("docs/competitors/index.json"));
	const form = readRoot(".github/ISSUE_TEMPLATE/competitor-gap.yml");
	const options = (id) => {
		const block = form.split(`id: ${id}\n`)[1].split("validations:")[0].split("options:\n")[1];
		return block.split("\n").filter((l) => l.trim().startsWith("- ")).map((l) => l.trim().slice(2));
	};
	assert.deepEqual(options("competitor"), index.competitors.map((c) => c.name));
	assert.deepEqual(options("area"), index.areas);
	const names = new Set(JSON.parse(readRoot("docs/competitors/labels.json")).map((l) => l.name));
	for (const c of index.competitors) assert.ok(names.has(`competitor: ${c.id}`), c.id);
	for (const a of index.areas) assert.ok(names.has(`area: ${a}`), a);
	for (const l of BASE_LABELS) assert.ok(names.has(l), l);
	assert.deepEqual(labelsFor(index.competitors[0], { area: index.areas[0] }).slice(-2), [`competitor: ${index.competitors[0].id}`, `area: ${index.areas[0]}`]);
});
