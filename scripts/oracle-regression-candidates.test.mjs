// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { defectKey, freeName, planCandidates, readFixtures, renderReport } from "./oracle-regression-candidates.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "oracle-regression-candidates.mjs");

const fixture = ({ seed = 1, invariant = "env-has-jwt-secret", actual = "JWT_SECRET missing", resources = 1, ...rest } = {}) => ({
	schema_version: 1,
	engine: "ORACLE",
	invariant,
	seed,
	shape: "byo-only",
	commit: "abcdef12",
	scenario: {
		seed,
		shape: "byo-only",
		resources: Array.from({ length: resources }, (_, i) => ({ name: `svc-${i}`, kind: "bring-your-own", stack: "main", args: [] })),
		expect: { database: false, gateway: false, cycle: false, dangling: false },
	},
	expected: "JWT_SECRET in .env",
	actual,
	reproduction: "node --test tests/oracle/__tests__/regressions.test.mjs",
	status: "open",
	...rest,
});
const entry = (fx, file = `${fx.invariant}-${fx.seed}.json`) => ({ file, fx });
// A replay that reproduces exactly what the fixture recorded.
const reproduces = (fx) => ({ invariant: fx.invariant, expected: fx.expected, actual: fx.actual });

test("the same defect from another seed or on another port has the same key; another symptom does not", () => {
	assert.equal(defectKey(fixture({ seed: 1, actual: "GET localhost:4100 failed" })), defectKey(fixture({ seed: 9, actual: "GET localhost:5222 failed" })));
	assert.notEqual(defectKey(fixture({ actual: "exited 1" })), defectKey(fixture({ actual: "exited 2" })));
	assert.notEqual(defectKey(fixture()), defectKey(fixture({ invariant: "surfaces-ran" })));
});

test("a reproducing new candidate is added, as open", () => {
	const report = planCandidates({ candidates: [entry(fixture({ status: "fixed" }))], known: [], replay: reproduces });
	assert.equal(report.added.length, 1);
	assert.equal(report.added[0].fx.status, "open");
	assert.equal(report.added[0].file, "env-has-jwt-secret-1.json");
});

test("a candidate that duplicates a vault fixture is dropped without a replay", () => {
	let replays = 0;
	const report = planCandidates({
		candidates: [entry(fixture({ seed: 7, actual: "TMP /tmp/oracle-7-abc/x missing" }))],
		known: [entry(fixture({ seed: 3, actual: "TMP /private/tmp/oracle-3-zzz/x missing" }))],
		replay: (fx) => (replays++, reproduces(fx)),
	});
	assert.equal(report.added.length, 0);
	assert.equal(report.duplicates.length, 1);
	assert.equal(replays, 0);
});

test("two candidates for one defect keep the smaller scenario", () => {
	const report = planCandidates({
		candidates: [entry(fixture({ seed: 1, resources: 3 })), entry(fixture({ seed: 2, resources: 1 }))],
		known: [],
		replay: reproduces,
	});
	assert.deepEqual(report.added.map((a) => a.from), ["env-has-jwt-secret-2.json"]);
	assert.deepEqual(report.duplicates.map((d) => d.file), ["env-has-jwt-secret-1.json"]);
});

test("a candidate that holds, fails differently or crashes on replay is flaky and left out", () => {
	const report = planCandidates({
		candidates: [entry(fixture({ seed: 1, actual: "a" })), entry(fixture({ seed: 2, actual: "b" })), entry(fixture({ seed: 3, actual: "c" }))],
		known: [],
		replay: (fx) => {
			if (fx.seed === 1) return null;
			if (fx.seed === 2) return { ...reproduces(fx), actual: "something else" };
			throw new Error("scaffold exited 1");
		},
	});
	assert.equal(report.added.length, 0);
	assert.deepEqual(report.flaky.map((f) => f.file), ["env-has-jwt-secret-1.json", "env-has-jwt-secret-2.json", "env-has-jwt-secret-3.json"]);
	assert.match(report.flaky[0].reason, /invariant now holds/);
	assert.match(report.flaky[1].reason, /fails differently/);
	assert.match(report.flaky[2].reason, /crashed/);
});

test("an invalid or unparsable candidate is reported and never replayed", () => {
	let replays = 0;
	const report = planCandidates({
		candidates: [entry({ ...fixture(), invariant: "no-such-invariant" }), { file: "broken.json", fx: null, parseError: "Unexpected token" }],
		known: [],
		replay: () => (replays++, null),
	});
	assert.equal(replays, 0);
	assert.equal(report.invalid.length, 2);
	assert.match(report.invalid[0].reason, /unknown invariant/);
	assert.match(report.invalid[1].reason, /not JSON/);
});

test("a new defect whose usual file name is taken gets a suffix", () => {
	assert.equal(freeName(fixture(), new Set(["env-has-jwt-secret-1.json", "env-has-jwt-secret-1-2.json"])), "env-has-jwt-secret-1-3.json");
	const report = planCandidates({ candidates: [entry(fixture({ actual: "new symptom" }))], known: [entry(fixture())], replay: reproduces });
	assert.equal(report.added[0].file, "env-has-jwt-secret-1-2.json");
});

test("the report lists added, flaky, duplicate and invalid candidates", () => {
	const text = renderReport({
		added: [{ file: "a.json", fx: fixture({ actual: "x | y" }) }],
		flaky: [{ file: "b.json", reason: "now holds" }],
		duplicates: [{ file: "c.json", reason: "same" }],
		invalid: [],
	});
	assert.match(text, /1 new/);
	assert.match(text, /x \\\| y/);
	assert.match(text, /`b.json`: now holds/);
	assert.match(text, /`c.json`: same/);
	assert.doesNotMatch(text, /Not a valid/);
});

test("the CLI with no new defects writes nothing and reports zero on GITHUB_OUTPUT", () => {
	const tmp = mkdtempSync(path.join(os.tmpdir(), "oracle-candidates-"));
	try {
		const [cand, vault] = ["cand", "vault"].map((d) => path.join(tmp, d));
		mkdirSync(cand);
		mkdirSync(vault);
		writeFileSync(path.join(vault, "env-has-jwt-secret-1.json"), JSON.stringify(fixture()));
		writeFileSync(path.join(cand, "env-has-jwt-secret-5.json"), JSON.stringify(fixture({ seed: 5 })));
		writeFileSync(path.join(cand, "bad.json"), "{");
		const out = path.join(tmp, "out.txt");
		const r = spawnSync(process.execPath, [SCRIPT, "--candidates", cand, "--vault", vault], { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: out } });
		assert.equal(r.status, 0, r.stderr);
		assert.match(r.stdout, /0 new/);
		assert.match(readFileSync(out, "utf8"), /^added=0$/m);
		assert.deepEqual(readdirSync(vault), ["env-has-jwt-secret-1.json"]);
		assert.equal(readFixtures(path.join(tmp, "missing")).length, 0);
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
});
