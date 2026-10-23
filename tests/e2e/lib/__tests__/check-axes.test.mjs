// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for tests/e2e/lib/check-axes.mjs. Run by `make test-shell`.
import assert from "node:assert/strict";
import test from "node:test";
import { checkAxes, sourceValues } from "../check-axes.mjs";

const map = {
	file: "src.ts",
	start: "export const M",
	end: "\n};",
	kind: "map",
};
const array = {
	file: "src.ts",
	start: "export const A",
	end: "] as const",
	kind: "array",
};

test("a map source yields its keys, quoted or not", () => {
	const text =
		'export const M: X = {\n  hono: honoProvider,\n  "tanstack-router": tanstack,\n};\n';
	assert.deepEqual([...sourceValues(text, map)].sort(), [
		"hono",
		"tanstack-router",
	]);
});

test("an array source yields its quoted strings only", () => {
	const text = 'export const A = ["files", "postgres"] as const;\n';
	assert.deepEqual([...sourceValues(text, array)], ["files", "postgres"]);
});

test("a source whose start is missing yields null", () => {
	assert.equal(sourceValues("nothing here", map), null);
});

const leg = () => true;
const axis = (values, extra = {}) => ({
	groups: ["g"],
	defaults: [],
	values,
	interactions: [],
	...extra,
});

test("covered values pass", () => {
	const axes = {
		x: axis({ a: { allow: "#1" }, b: { leg: "resource-types/agent" } }),
	};
	assert.deepEqual(
		checkAxes({ axes, readSource: () => null, legExists: leg }),
		[],
	);
});

test("a value with neither a leg nor an issue fails, and so does a value with both", () => {
	const axes = { x: axis({ a: {}, b: { leg: "l", allow: "#1" } }) };
	const problems = checkAxes({ axes, readSource: () => null, legExists: leg });
	assert.match(problems[0], /value "a": needs exactly one/);
	assert.match(problems[1], /value "b": needs exactly one/);
});

test("a value may name several legs, and each must exist", () => {
	const axes = {
		x: axis({ a: { legs: ["journeys/dev-loop", "resource-types/backend"] } }),
	};
	assert.deepEqual(
		checkAxes({ axes, readSource: () => null, legExists: leg }),
		[],
	);
	const problems = checkAxes({
		axes,
		readSource: () => null,
		legExists: (l) => l !== "journeys/dev-loop",
	});
	assert.match(problems[0], /leg "journeys\/dev-loop" has no tests\/e2e/);
});

test("a value with both leg and legs fails", () => {
	const axes = { x: axis({ a: { leg: "l", legs: ["l"] } }) };
	const problems = checkAxes({ axes, readSource: () => null, legExists: leg });
	assert.match(problems[0], /value "a": needs exactly one/);
});

test("an allowlist entry needs an issue link", () => {
	const problems = checkAxes({
		axes: { x: axis({ a: { allow: "later" } }) },
		readSource: () => null,
		legExists: leg,
	});
	assert.match(problems[0], /must be an issue such as #1292/);
});

test("a leg must name an existing suite", () => {
	const problems = checkAxes({
		axes: { x: axis({ a: { leg: "resource-types/nope" } }) },
		readSource: () => null,
		legExists: () => false,
	});
	assert.match(problems[0], /leg "resource-types\/nope" has no tests\/e2e/);
});

test("a source value missing from axes.json fails", () => {
	const axes = { x: axis({ a: { allow: "#1" } }, { source: map }) };
	const problems = checkAxes({
		axes,
		readSource: () => "export const M = {\n  a: 1,\n  b: 2,\n};\n\n",
		legExists: leg,
	});
	assert.deepEqual(problems, [
		'axis x: source value "b" (src.ts) has no entry in axes.json',
	]);
});

test("a missing source file fails", () => {
	const problems = checkAxes({
		axes: { x: axis({ a: { allow: "#1" } }, { source: map }) },
		readSource: () => null,
		legExists: leg,
	});
	assert.match(problems[0], /source src.ts or its start/);
});

test("defaults must be listed values, and interactions must name known axes and give a reason", () => {
	const axes = {
		x: axis(
			{ a: { allow: "#1" } },
			{
				defaults: ["zzz"],
				interactions: [{ axes: ["x", "nope"], reason: "r" }],
			},
		),
		y: axis(
			{ a: { allow: "#1" } },
			{ interactions: [{ axes: ["x", "y"], reason: "" }] },
		),
	};
	const problems = checkAxes({ axes, readSource: () => null, legExists: leg });
	assert.match(problems[0], /default "zzz" is not a listed value/);
	assert.match(problems[1], /interaction needs two or more known axes/);
	assert.match(problems[2], /interaction \["x","y"\] needs a reason/);
});
