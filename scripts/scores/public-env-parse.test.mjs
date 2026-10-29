// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { assignments, readValue } from "./public-env/parse.mjs";
import { countAssignments, secretAssignments } from "./public-env/scan.mjs";

const pairs = (line) => assignments(line).map((a) => `${a.name}=${a.value}`);

test("readValue reads quoted values whole and unquoted values up to a closing character", () => {
	assert.equal(readValue('"two words" tail'), "two words");
	assert.equal(readValue("'single' x"), "single");
	assert.equal(readValue("`tick`"), "tick");
	assert.equal(readValue("plain next"), "plain");
	assert.equal(readValue("end);"), "end");
	assert.equal(readValue('"unterminated'), "unterminated");
	assert.equal(readValue(""), "");
});

test("assignments reads env, YAML, JSON, Dockerfile, build-arg and list forms", () => {
	assert.deepEqual(pairs("VITE_A=one"), ["VITE_A=one"]);
	assert.deepEqual(pairs("  - NEXT_PUBLIC_B=two"), ["NEXT_PUBLIC_B=two"]);
	assert.deepEqual(pairs("VITE_C: 'three'"), ["VITE_C=three"]);
	assert.deepEqual(pairs('"VITE_D": "four five"'), ["VITE_D=four five"]);
	assert.deepEqual(pairs("ENV VITE_E=six"), ["VITE_E=six"]);
	assert.deepEqual(pairs("--build-arg VITE_F=seven"), ["VITE_F=seven"]);
	assert.deepEqual(pairs("VITE_URL=http://host:80/p"), ["VITE_URL=http://host:80/p"]);
});

test("assignments reads several variables on one line, left to right", () => {
	assert.deepEqual(pairs("VITE_A=1 NEXT_PUBLIC_B=2"), ["VITE_A=1", "NEXT_PUBLIC_B=2"]);
});

test("assignments ignores constants, plain mentions and variables without a value", () => {
	for (const line of [
		"_VITE_BUILD = 'vite build'",
		'REACT_VITE_FRONTEND = """x"""',
		"uses `VITE_API_URL` at build time",
		"load('./a.star', 'X_VITE_Y')",
		"VITE_ONLY",
	])
		assert.deepEqual(assignments(line), [], line);
});

test("secretAssignments keeps the line and name, never the value", () => {
	const hits = secretAssignments("VITE_OK=fine\nVITE_BAD=SECRETVALUE123\n", (v) => v.startsWith("SECRET"));
	assert.deepEqual(hits, [{ line: 2, name: "VITE_BAD" }]);
	assert.equal(JSON.stringify(hits).includes("SECRETVALUE"), false);
});

test("the judge receives the value and the variable name", () => {
	const seen = [];
	secretAssignments("VITE_X=abc", (v, n) => seen.push([v, n]) && false);
	assert.deepEqual(seen, [["abc", "VITE_X"]]);
});

test("countAssignments counts every public assignment in a text", () => {
	assert.equal(countAssignments("VITE_A=1\nnothing\nNEXT_PUBLIC_B: 2\n"), 2);
});
