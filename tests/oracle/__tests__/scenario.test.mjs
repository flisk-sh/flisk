// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { drawPlan } from "../../e2e/scale/enigma36/plan.mjs";
import { SHAPES, drawScenario } from "../lib/scenario.mjs";

test("the same seed draws the same scenario", () => {
	for (const seed of [1, 42, 1936]) assert.deepEqual(drawScenario(seed), drawScenario(seed));
});

test("seeds reach every shape", () => {
	const seen = new Set();
	for (let seed = 0; seed < 200; seed++) seen.add(drawScenario(seed).shape);
	assert.deepEqual([...seen].sort(), [...SHAPES].sort());
});

test("the enigma-mix shape is ENIGMA's own draw for that seed", () => {
	const plan = drawPlan(1936, { count: 8 });
	const sc = drawScenario(1936, { shape: "enigma-mix", count: 8 });
	assert.deepEqual(sc.resources.map((r) => [r.name, r.kind, r.stack, r.args]), plan.entries.map((e) => [e.name, e.kind, e.stack, e.args]));
});

test("what each shape expects follows from its resources", () => {
	for (let seed = 0; seed < 100; seed++) {
		const sc = drawScenario(seed);
		if (sc.shape === "byo-only") assert.deepEqual(sc.expect, { database: false, gateway: true });
		if (sc.shape === "byo-no-proxy") assert.deepEqual(sc.expect, { database: false, gateway: false });
		if (sc.shape === "byo-postgres-dep") assert.equal(sc.expect.database, true);
		if (sc.shape === "enigma-mix") assert.equal(sc.expect.database, sc.resources.some((r) => r.kind === "database" || r.kind !== "bring-your-own"));
	}
});

test("an unknown shape is an error", () => assert.throws(() => drawScenario(1, { shape: "nope" }), /unknown shape/));
