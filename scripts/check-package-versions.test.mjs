// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { isSemver, problems, readEntries } from "./check-package-versions.mjs";

test("isSemver accepts x.y.z and rejects the string undefined", () => {
	assert.ok(isSemver("1.4.66"));
	assert.ok(isSemver("1.4.66-rc.1"));
	for (const bad of ["undefined", "", "1.4", "v1.4.66", undefined, null]) assert.equal(isSemver(bad), false);
});

test("problems flags an undefined version and a mismatch", () => {
	assert.deepEqual(problems([{ file: "a", version: "1.0.0" }, { file: "b", version: "1.0.0" }]), []);
	assert.equal(problems([{ file: "a", version: "undefined" }, { file: "b", version: "undefined" }]).length, 2);
	assert.match(problems([{ file: "a", version: "1.0.1" }, { file: "b", version: "1.0.0" }])[0], /differ/);
});

test("this repo's package.json files pass", () => {
	assert.deepEqual(problems(readEntries(new URL("..", import.meta.url).pathname)), []);
});
