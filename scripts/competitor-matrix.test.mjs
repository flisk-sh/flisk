// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/competitor-matrix.mjs.
//   node --test scripts/competitor-matrix.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { cell, render } from "./competitor-matrix.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = (status) => ({ flisk: { status, scope: status === "out-of-scope" ? "out" : "in" } });

test("cell symbols", () => {
	assert.equal(cell([r("covered"), r("covered")]), "✅ 2/2");
	assert.equal(cell([r("covered"), r("missing")]), "◐ 1/2");
	assert.equal(cell([r("partial")]), "◐ 0/1");
	assert.equal(cell([r("missing")]), "✗ 0/1");
	assert.equal(cell([r("out-of-scope")]), "— (out of scope)");
	assert.equal(cell([]), "—");
});

test("the committed MATRIX.md is fresh and carries the disclaimer", () => {
	const committed = readFileSync(path.join(root, "docs/competitors/MATRIX.md"), "utf8");
	assert.equal(committed, render(root));
	assert.match(committed, /not an endorsement, a ranking or a benchmark/);
	assert.match(committed, /## Not raised: below the ICE bar/);
});
