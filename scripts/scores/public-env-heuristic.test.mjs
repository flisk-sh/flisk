// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { CASES, misclassified } from "./public-env-heuristic.mjs";

test("the corpus has both sides: credentials to catch and public values to leave alone", () => {
	assert.ok(CASES.filter((c) => c.secret).length >= 10);
	assert.ok(CASES.filter((c) => !c.secret).length >= 10);
	assert.equal(new Set(CASES.map((c) => `${c.name}=${c.value}`)).size, CASES.length, "no duplicate cases");
});

test("a heuristic that warns on everything fails every public case, as false positives", () => {
	const findings = misclassified(() => true);
	assert.equal(findings.length, CASES.filter((c) => !c.secret).length);
	assert.ok(findings.every((f) => f.endsWith("warns (false positive)")));
});

test("a heuristic that never warns misses every credential, as false negatives", () => {
	const findings = misclassified(() => false);
	assert.equal(findings.length, CASES.filter((c) => c.secret).length);
	assert.ok(findings.every((f) => f.endsWith("misses it (false negative)")));
});

test("findings name the promise and the variable, not the value", () => {
	const [first] = misclassified(() => false);
	const c = CASES.find((x) => x.secret);
	assert.ok(first.includes(c.why) && first.includes(c.name));
	assert.equal(first.includes(c.value), false);
});
