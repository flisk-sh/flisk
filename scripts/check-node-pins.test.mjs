// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { compare, findPins, floorOf, latestByMajor, stalePins } from "./check-node-pins.mjs";

const index = [{ version: "v26.13.1" }, { version: "v24.22.3" }, { version: "v24.9.0" }, { version: "v22.23.5" }, { version: "v22.9.0" }];

test("compare orders numerically, not as strings", () => {
	assert.ok(compare("22.9.0", "22.23.5") < 0);
	assert.equal(compare("24.22.3", "v24.22.3"), 0);
});

test("findPins keeps exact versions and skips floating and matrix pins", () => {
	const text = ["      - with:", "          node-version: 22.23.5", "          node-version: 22", "          node-version: ${{ matrix.n }}", "          node-version: lts/*", '      - node-version: "24.22.3" # pin'].join("\n");
	assert.deepEqual(findPins([{ file: "a.yml", text }]).map((p) => [p.line, p.version]), [[2, "22.23.5"], [6, "24.22.3"]]);
});

test("latestByMajor finds the newest release of each line", () => {
	const latest = latestByMajor(index);
	assert.equal(latest.get(22), "22.23.5");
	assert.equal(latest.get(24), "24.22.3");
});

test("stalePins reports a pin behind its line, but not the engines floor or a current pin", () => {
	const latest = latestByMajor(index);
	const pins = [
		{ file: "a.yml", line: 3, version: "22.12.0" },
		{ file: "a.yml", line: 9, version: "22.23.4" },
		{ file: "b.yml", line: 5, version: "24.22.3" },
		{ file: "c.yml", line: 2, version: "20.1.0" },
	];
	assert.deepEqual(stalePins(pins, latest, "22.12.0"), ["a.yml:9: node-version 22.23.4 is behind 22.23.5, the newest release of Node 22"]);
	assert.equal(stalePins([pins[0]], latest, null).length, 1);
});

test("floorOf reads a >= engines range and nothing else", () => {
	assert.equal(floorOf(">=22.12.0"), "22.12.0");
	assert.equal(floorOf("^22"), null);
	assert.equal(floorOf(undefined), null);
});
