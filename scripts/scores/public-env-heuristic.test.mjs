// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { CASES, CREDENTIALS, PUBLIC_VALUES } from "./public-env/corpus.mjs";
import { describeError, errorKind, evaluate } from "./public-env/evaluate.mjs";
import { measure } from "./public-env-heuristic.mjs";

test("the corpus holds both sides and no duplicate case", () => {
	assert.ok(CREDENTIALS.length >= 10 && CREDENTIALS.every((c) => c.secret));
	assert.ok(PUBLIC_VALUES.length >= 10 && PUBLIC_VALUES.every((c) => !c.secret));
	assert.equal(new Set(CASES.map((c) => `${c.name}=${c.value}`)).size, CASES.length);
});

test("errorKind names the direction of a mistake", () => {
	const secret = { name: "VITE_A", value: "v", secret: true, why: "w" };
	assert.equal(errorKind(() => false, secret), "false negative");
	assert.equal(errorKind(() => true, { ...secret, secret: false }), "false positive");
	assert.equal(errorKind(() => true, secret), null);
});

test("evaluate: a perfect judge scores 100, flag-everything fails the public cases, flag-nothing the credentials", () => {
	const perfect = (value, name) => CASES.find((c) => c.value === value && c.name === name).secret;
	assert.equal(evaluate(perfect, CASES).accuracy, 100);
	const all = evaluate(() => true, CASES);
	assert.equal(all.errors.length, PUBLIC_VALUES.length);
	assert.ok(all.errors.every((e) => e.kind === "false positive"));
	const none = evaluate(() => false, CASES);
	assert.equal(none.errors.length, CREDENTIALS.length);
	assert.ok(none.errors.every((e) => e.kind === "false negative"));
});

test("describeError names the promise and variable, not the value", () => {
	const [error] = evaluate(() => false, CASES).errors;
	const line = describeError(error);
	assert.ok(line.includes(error.case.why) && line.includes(error.case.name) && line.endsWith("false negative"));
	assert.equal(line.includes(error.case.value), false);
});

test("measure scores an injected judge and reports the mistakes as findings", async () => {
	const r = await measure({ root: "/unused" }, { judge: () => false });
	assert.equal(r.findings.length, CREDENTIALS.length);
	assert.match(r.summary, /cases right/);
	assert.equal((await measure({ root: "/unused" }, { judge: (v, n) => CASES.find((c) => c.value === v && c.name === n).secret })).value, 100);
});
