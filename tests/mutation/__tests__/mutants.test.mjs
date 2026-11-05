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
