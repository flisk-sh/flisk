// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLedger, decide, fingerprint, issueBody, markerFor, parseMarker } from "./bug-hunt-issues.mjs";

const falsifier = (seed, actual) => ({ engine: "FALSIFIER", property: "invalid-resources-rejected", seed, commit: "abc", expected: "rejected", actual, reproduction: `replay ${seed}`, minimized: { kind: "name" } });

test("the same defect found by another seed has the same fingerprint", () => {
	const a = fingerprint(falsifier(10, `exit 0, 6 files created (services/main/${"x".repeat(64)}/Dockerfile)`));
	const b = fingerprint(falsifier(15, `exit 0, 6 files created (services/main/s15-${"x".repeat(60)}/Dockerfile)`));
	assert.equal(a, b);
});

test("a different check or a different symptom is a different defect", () => {
	assert.notEqual(fingerprint(falsifier(1, "exit 0")), fingerprint(falsifier(1, "exit 2, wrote nothing")));
	assert.notEqual(fingerprint(falsifier(1, "exit 0")), fingerprint({ ...falsifier(1, "exit 0"), engine: "ORACLE", property: undefined, invariant: "env-matches" }));
});

test("the ledger counts repeats and keeps the first as the example", () => {
	const ledger = buildLedger([falsifier(1, "exit 0 x1"), falsifier(2, "exit 0 x2"), falsifier(3, "other")]);
	assert.equal(ledger.length, 2);
	assert.equal(ledger[0].count, 2);
	assert.equal(ledger[0].example.seed, 1);
});

test("the marker round-trips and a body without one yields null", () => {
	assert.equal(parseMarker(`text\n${markerFor("falsifier-abc")}\nmore`), "falsifier-abc");
	assert.equal(parseMarker("a human wrote this"), null);
	assert.equal(parseMarker(undefined), null);
});

test("decide: create when unknown, keep when open, reopen when closed", () => {
	const ledger = buildLedger([falsifier(1, "one"), falsifier(1, "two"), falsifier(1, "three")]);
	const [a, b] = ledger;
	const issues = [
		{ number: 7, state: "OPEN", body: markerFor(a.id) },
		{ number: 8, state: "CLOSED", body: markerFor(b.id) },
		{ number: 9, state: "OPEN", body: "no marker, a human issue" },
	];
	assert.deepEqual(decide(ledger, issues).map((d) => [d.action, d.number]), [["keep", 7], ["reopen", 8], ["create", undefined]]);
});

test("the issue body carries the marker, the replay command and the minimal case", () => {
	const [record] = buildLedger([falsifier(10, "exit 0")]);
	const body = issueBody(record, { url: "https://example.test/run/1" });
	for (const part of [markerFor(record.id), "replay 10", '{"kind":"name"}', "https://example.test/run/1"]) assert.ok(body.includes(part), part);
});
