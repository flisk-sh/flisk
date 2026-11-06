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
import { classify, main } from "../run.mjs";

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

test("the runner refuses unknown engines and an exporter mutant without a clone before touching any file", () => {
	assert.throws(() => main(["--skip", "oracel"]), /unknown engine in --skip: oracel/);
	assert.throws(() => main(["--mutant", "nope"]), /unknown mutant "nope"/);
	assert.throws(() => main(["--mutant", "compose-last-env-dropped"]), /--export-repo/);
});
