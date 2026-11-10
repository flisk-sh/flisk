// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import test from "node:test";
import {
	STACKS,
	calculateStats,
	formatMarkdownReport,
	getEnvironmentInfo,
} from "./compose-comparison.mjs";

test("calculateStats handles empty and single-element arrays", () => {
	assert.equal(calculateStats([]).count, 0);
	assert.equal(calculateStats([]).median, null);

	const single = calculateStats([3.5]);
	assert.equal(single.count, 1);
	assert.equal(single.min, 3.5);
	assert.equal(single.max, 3.5);
	assert.equal(single.median, 3.5);
	assert.equal(single.p90, 3.5);
});

test("calculateStats accurately computes median and p90 for odd and even samples", () => {
	// Odd count (5 elements)
	const odd = calculateStats([1.0, 5.0, 3.0, 2.0, 4.0]);
	assert.equal(odd.count, 5);
	assert.equal(odd.min, 1.0);
	assert.equal(odd.max, 5.0);
	assert.equal(odd.median, 3.0);
	assert.equal(odd.p90, 5.0);

	// Even count (4 elements)
	const even = calculateStats([10.0, 20.0, 30.0, 40.0]);
	assert.equal(even.count, 4);
	assert.equal(even.min, 10.0);
	assert.equal(even.max, 40.0);
	assert.equal(even.median, 25.0);
	assert.equal(even.p90, 40.0);
});

test("registered STACKS contain demo, backend-postgres, and agent-stack with probe URLs", () => {
	const keys = Object.keys(STACKS);
	assert.ok(keys.includes("demo"), "missing demo stack");
	assert.ok(keys.includes("backend-postgres"), "missing backend-postgres stack");
	assert.ok(keys.includes("agent-stack"), "missing agent-stack");

	for (const [key, def] of Object.entries(STACKS)) {
		assert.ok(def.name, `Stack ${key} missing name`);
		assert.ok(Array.isArray(def.urls), `Stack ${key} missing urls array`);
		assert.ok(def.urls.length >= 1, `Stack ${key} urls array is empty`);
		for (const u of def.urls) {
			assert.match(u, /^http:\/\/localhost:\d+\//);
		}
	}
});

test("getEnvironmentInfo discovers system and tool versions", () => {
	const info = getEnvironmentInfo();
	assert.ok(info.os, "os missing");
	assert.ok(info.arch, "arch missing");
	assert.ok(info.nodeVersion, "nodeVersion missing");
	assert.ok(typeof info.cpuCount === "number", "cpuCount should be number");
});

test("formatMarkdownReport produces clean GitHub-flavored markdown", () => {
	const mockData = {
		date: "2026-11-09",
		environment: {
			machine: "Apple M4",
			os: "macOS Darwin 25.5.0",
			dockerEngine: "29.8.2",
			dockerCompose: "v5.5.1",
			flisk: "1.4.45",
			nodeVersion: "v24.15.0",
		},
		results: [
			{
				stack: "demo",
				name: "Demo (Web + API)",
				fliskCold: { count: 3, median: 0.32, p90: 0.35, samples: [0.31, 0.32, 0.35] },
				fliskWarm: { count: 3, median: 0.18, p90: 0.21, samples: [0.17, 0.18, 0.21] },
				composeCold: { count: 3, median: 2.45, p90: 2.6, samples: [2.4, 2.45, 2.6] },
				composeWarm: { count: 3, median: 1.85, p90: 1.95, samples: [1.8, 1.85, 1.95] },
			},
		],
	};

	const md = formatMarkdownReport(mockData);
	assert.ok(md.includes("# Benchmark: Flisk vs Docker Compose"));
	assert.ok(md.includes("Demo (Web + API)"));
	assert.ok(md.includes("0.320 s") || md.includes("0.32 s"));
	assert.ok(md.includes("v24.15.0"), "Node version line should be rendered");
	assert.ok(md.includes("29.8.2"), "Docker engine line should be rendered");
});
