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
		if (sc.shape === "byo-only") assert.deepEqual(sc.expect, { database: false, gateway: true, cycle: false, dangling: false });
		if (sc.shape === "byo-no-proxy") assert.deepEqual(sc.expect, { database: false, gateway: false, cycle: false, dangling: false });
		if (sc.shape === "byo-postgres-dep") assert.equal(sc.expect.database, true);
		if (sc.shape === "enigma-mix") assert.equal(sc.expect.database, sc.resources.some((r) => r.kind === "database" || r.kind !== "bring-your-own"));
	}
});

test("an unknown shape is an error", () => assert.throws(() => drawScenario(1, { shape: "nope" }), /unknown shape/));

test("the dependsOn shapes build the graph they promise", () => {
	const sc = drawScenario(9, { shape: "depends-cycle" });
	const names = sc.resources.map((r) => r.name);
	assert.deepEqual(sc.resources.at(-1).dependsOn, [names[0]]);
	assert.equal(sc.expect.cycle, true);
	const ghost = drawScenario(9, { shape: "depends-dangling" });
	assert.ok(ghost.resources[0].dependsOn.includes("ghost"));
	assert.deepEqual([ghost.expect.cycle, ghost.expect.dangling], [false, true]);
	assert.deepEqual(drawScenario(9, { shape: "depends-chain" }).resources.at(-1).dependsOn, []);
});

test("multi-stack spreads resources over at least two stacks; infra-toggle names every optional service", () => {
	for (let seed = 0; seed < 30; seed++) {
		assert.ok(new Set(drawScenario(seed, { shape: "multi-stack" }).resources.map((r) => r.stack)).size >= 2);
		assert.deepEqual(Object.keys(drawScenario(seed, { shape: "infra-toggle" }).infra), ["monitoring", "elk", "debezium", "golden_image"]);
	}
});

test("enigma-mix records the type status reports for a queue or MySQL-style database (#3862)", () => {
	let queues = 0;
	for (let seed = 1; seed < 400; seed++) {
		for (const r of drawScenario(seed, { shape: "enigma-mix", count: 8 }).resources) {
			if (r.kind === "queue") {
				queues++;
				assert.equal(r.type, "bring-your-own");
			} else if (r.kind !== "database") assert.equal(r.type, r.kind);
		}
	}
	assert.ok(queues > 0, "the draw includes queues");
});
