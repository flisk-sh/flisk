// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { INVARIANTS } from "../lib/invariants.mjs";
import { SHAPES } from "../lib/scenario.mjs";
import { fixtureName, loadRegressions, minimizeScenario, toRegression, verdict } from "../lib/vault.mjs";

const backend = (name, dependsOn = []) => ({ name, kind: "backend", stack: "main", args: [], dependsOn });
const scenario = { seed: 7, shape: "depends-chain", resources: [backend("a", ["b"]), backend("b", ["c"]), backend("c")], expect: {} };
const failure = { engine: "ORACLE", seed: 7, invariant: "x", expected: "e", actual: "broke on 3 ports" };

test("toRegression keeps the scenario, the symptom and an open status", () => {
	const fx = toRegression(failure, scenario, { commit: "abc" });
	assert.equal(fx.status, "open");
	assert.deepEqual(fx.scenario, scenario);
	assert.equal(fx.actual, failure.actual);
	assert.equal(fx.commit, "abc");
	assert.equal(fixtureName(fx), "x-7.json");
});

test("verdict: fixed must hold, open must still fail the same way", () => {
	const open = { status: "open", actual: "exited 1 after 3 tries" };
	assert.equal(verdict("f", open, { actual: "exited 1 after 9 tries" }), null, "digits are not the symptom");
	assert.match(verdict("f", open, null), /set its status to "fixed"/);
	assert.match(verdict("f", open, { actual: "something else" }), /fails differently/);
	assert.equal(verdict("f", { status: "fixed" }, null), null);
	assert.match(verdict("f", { status: "fixed" }, { actual: "boom" }), /regressed: boom/);
});

test("minimizeScenario keeps only the resources the contradiction needs and unhooks dependsOn on the dropped ones", () => {
	const calls = [];
	// The bug needs resource "a" only.
	const replay = (sc) => { calls.push(sc.resources.map((r) => r.name).join()); return sc.resources.some((r) => r.name === "a") ? { actual: "broke on 5 ports" } : null; };
	const small = minimizeScenario(scenario, failure, replay);
	assert.deepEqual(small.resources, [backend("a", [])]);
	assert.ok(calls.length <= scenario.resources.length);
	assert.equal(minimizeScenario(scenario, failure, () => ({ actual: "a different symptom" })), scenario, "a drop that changes the symptom is not kept");
});

test("every saved fixture is well formed", () => {
	const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../regressions");
	const ids = INVARIANTS.map((i) => i.id);
	const fixtures = loadRegressions(dir);
	assert.ok(fixtures.length > 0);
	for (const { file, fx } of fixtures) {
		assert.equal(fx.engine, "ORACLE", file);
		assert.ok(ids.includes(fx.invariant), `${file}: unknown invariant ${fx.invariant}`);
		assert.ok(["open", "fixed"].includes(fx.status), `${file}: status is open or fixed`);
		assert.ok(fx.scenario?.resources?.length > 0 && fx.scenario.expect, `${file}: carries its scenario`);
		assert.ok(fx.shape === "minimized" || SHAPES.includes(fx.shape), `${file}: shape`);
		assert.equal(JSON.parse(readFileSync(path.join(dir, file), "utf8")).actual, fx.actual);
	}
});
