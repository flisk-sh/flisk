// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fixtureName, loadRegressions, minimizeScenario, normalizeActual, toRegression, validateFixture, verdict } from "../lib/vault.mjs";

const backend = (name, dependsOn = []) => ({ name, kind: "backend", stack: "main", args: [], dependsOn });
const scenario = { seed: 7, shape: "depends-chain", resources: [backend("a", ["b"]), backend("b", ["c"]), backend("c")], expect: {} };
const failure = { engine: "ORACLE", seed: 7, invariant: "render-exports-http-resources", expected: "render.yaml lists a b c", actual: "export render exited 1" };

test("toRegression writes a schema v1 fixture that passes validation", () => {
	const fx = toRegression(failure, scenario, { commit: "abcdef12" });
	assert.equal(fx.schema_version, 1);
	assert.equal(fx.status, "open");
	assert.deepEqual(fx.scenario, scenario);
	assert.equal(fixtureName(fx), "render-exports-http-resources-7.json");
	assert.deepEqual(validateFixture(fx), []);
	assert.equal(toRegression({ ...failure, knownGap: "#3243" }, scenario, { commit: "unknown" }).known_gap, "#3243");
});

test("normalizeActual folds ports, temp paths and project names, and keeps every other number", () => {
	assert.equal(normalizeActual("no answer on localhost:51234"), normalizeActual("no answer on localhost:40001"));
	assert.equal(normalizeActual("refused 127.0.0.1:5432"), "refused 127.0.0.1:PORT");
	assert.equal(normalizeActual("missing /private/var/folders/x1/T/oracle-12-ab/main/.env"), "missing TMP");
	assert.equal(normalizeActual("missing /tmp/oracle-3/.env"), "missing TMP");
	assert.equal(normalizeActual("project oracle-17-k9Zq"), "project oracle-PROJECT");
	assert.notEqual(normalizeActual("export render exited 1"), normalizeActual("export render exited 2"), "exit codes are the symptom");
	assert.notEqual(normalizeActual("expected 1 resource, got 2"), normalizeActual("expected 10 resource, got 20"), "counts are the symptom");
});

test("verdict: fixed must hold; open must still fail with the same expected and actual side", () => {
	const open = { status: "open", expected: "render.yaml lists api", actual: "export render exited 1" };
	assert.equal(verdict("f", open, { expected: "render.yaml lists api", actual: "export render exited 1" }), null);
	assert.match(verdict("f", open, null), /set its status to "fixed"/);
	assert.match(verdict("f", { ...open, known_gap: "#3243" }, null), /drop the #3243 known-gap tag/);
	assert.match(verdict("f", open, { expected: "render.yaml lists api", actual: "export render exited 2" }), /fails differently/);
	assert.match(verdict("f", open, { expected: "render.yaml lists api web", actual: "export render exited 1" }), /expects something else/);
	assert.equal(verdict("f", { status: "fixed" }, null), null);
	assert.match(verdict("f", { status: "fixed" }, { actual: "boom" }), /regressed: boom/);
});

test("minimizeScenario keeps only what the defect needs and unhooks dependsOn on the dropped resources", () => {
	const replay = (sc) => (sc.resources.some((r) => r.name === "a") ? { expected: `lists ${sc.resources.map((r) => r.name).join(" ")}`, actual: "export render exited 1" } : null);
	const { scenario: small, failure: seen } = minimizeScenario(scenario, failure, replay);
	assert.deepEqual(small.resources, [backend("a", [])]);
	assert.equal(seen.expected, "lists a", "the fixture records the failure as the small scenario shows it");
	const other = minimizeScenario(scenario, failure, () => ({ expected: "x", actual: "export render exited 2" }));
	assert.equal(other.scenario, scenario, "a drop that changes the symptom is not kept");
});

test("minimizeScenario repeats passes until nothing more can go", () => {
	// b carries the defect, and c can go only once a is gone. The reverse pass tries c first (still needed), then b (needed),
	// then a (goes). Only a second pass gets back to c, so a single pass would stop at [b, c].
	const r = (n) => backend(n);
	const sc = { ...scenario, resources: [r("a"), r("b"), r("c")] };
	const has = (s, n) => s.resources.some((x) => x.name === n);
	const replay = (s) => (has(s, "b") && (has(s, "c") || !has(s, "a")) ? { actual: "export render exited 1" } : null);
	const { scenario: small, replays } = minimizeScenario(sc, failure, replay);
	assert.deepEqual(small.resources.map((x) => x.name), ["b"]);
	assert.ok(replays > 3, "it took more than one pass");
});

test("minimizeScenario stops at its replay budget", () => {
	let calls = 0;
	const many = { ...scenario, resources: Array.from({ length: 30 }, (_, i) => backend(`s${i}`)) };
	const { replays } = minimizeScenario(many, failure, () => { calls++; return null; }, { budget: 5 });
	assert.equal(calls, 5);
	assert.equal(replays, 5);
});

test("validateFixture names what is wrong", () => {
	const good = toRegression(failure, scenario, { commit: "abcdef12" });
	const errs = (patch) => validateFixture({ ...good, ...patch }).join("; ");
	assert.match(errs({ schema_version: 2 }), /schema_version/);
	assert.match(errs({ seed: "7" }), /seed must be an integer/);
	assert.match(errs({ commit: "HEAD" }), /commit/);
	assert.match(errs({ status: "maybe" }), /status/);
	assert.match(errs({ invariant: "nope" }), /unknown invariant/);
	assert.match(errs({ actual: " " }), /non-empty/);
	assert.match(errs({ known_gap: "3243" }), /known_gap/);
	assert.match(errs({ issue: "https://example.com/3243" }), /issue/);
	assert.match(errs({ scenario: { ...scenario, resources: [{ name: "Bad Name", kind: "rocket", stack: "main", args: [] }] } }), /not a valid name.*unknown kind/);
});

test("every saved fixture is valid (loadRegressions refuses an invalid one)", () => {
	const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../regressions");
	assert.ok(loadRegressions(dir).length > 0);
});
