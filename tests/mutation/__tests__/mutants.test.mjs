// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Every mutant must still match the code it mirrors, in the TypeScript source and the compiled dist, or the yield check silently
// measures nothing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { MUTANTS, mutate } from "../mutants.mjs";
import { buildFailed, classify, detectorKey, main } from "../run.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("mutant ids are unique", () => assert.equal(new Set(MUTANTS.map((m) => m.id)).size, MUTANTS.length));

// Exporter mutants are checked against a clone when FLISK_EXPORT_REPO points at one (CI has none).
const EXPORT = process.env.FLISK_EXPORT_REPO;
for (const m of MUTANTS) {
	test(`${m.id} applies and changes the code`, { skip: m.repo === "export" && !EXPORT }, () => {
		const files = m.repo === "export" ? [path.join(EXPORT ?? "", m.file)] : [`cli/src/${m.file}.ts`, `cli/dist/${m.file}.js`];
		for (const file of files) {
			const text = readFileSync(path.isAbsolute(file) ? file : path.join(ROOT, file), "utf8");
			assert.notEqual(mutate(text, m), text, file);
		}
	});
}

test("a pattern that is not there is refused", () => assert.throws(() => mutate("abc", { id: "x", find: "zzz", replace: "y" }), /not found/));

test("only exit 0 and 1 are results; anything else is an infrastructure error, not a catch", () => {
	assert.equal(classify({ status: 0 }, "x"), false);
	assert.equal(classify({ status: 1 }, "x"), true);
	for (const result of [{ status: 2, stderr: "boom" }, { status: null, signal: "SIGKILL" }, { status: null, error: new Error("ENOENT") }]) assert.throws(() => classify(result, "x"), /did not run properly/);
});

test("exit 1 without the engine's finding marker is a crash, not a catch", () => {
	assert.equal(classify({ status: 1, stdout: "FALSIFIED p (seed 1)" }, "x", /FALSIFIED /), true);
	assert.throws(() => classify({ status: 1, stdout: "", stderr: "TypeError: cannot read properties" }, "x", /FALSIFIED /), /crashed/);
});

test("a restore build that fails or cannot start is a failure", () => {
	assert.equal(buildFailed({ status: 0 }), false);
	assert.equal(buildFailed({ status: 1 }), true);
	assert.equal(buildFailed({ status: null, error: new Error("ENOENT") }), true);
});

test("mutants that run different detector commands get different baselines", () => {
	const [a, b] = [MUTANTS.find((m) => m.id === "uppercase-allowed"), MUTANTS.find((m) => m.id === "first-cycle-ignored")];
	assert.notEqual(detectorKey("falsifier", a), detectorKey("falsifier", b));
	assert.notEqual(detectorKey("unit", a), detectorKey("unit", b));
	assert.equal(detectorKey("falsifier", a), detectorKey("falsifier", MUTANTS.find((m) => m.id === "edge-hyphen-allowed")));
});

test("the runner refuses unknown engines and an exporter mutant without a clone before touching any file", () => {
	assert.throws(() => main(["--skip", "oracel"]), /unknown engine in --skip: oracel/);
	assert.throws(() => main(["--mutant", "nope"]), /unknown mutant "nope"/);
	assert.throws(() => main(["--mutant", "compose-last-env-dropped"]), /--export-repo/);
});
