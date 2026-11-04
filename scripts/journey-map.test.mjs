// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Behaviour tests for scripts/journey-map.mjs. Run by `make test-shell`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(SCRIPT_DIR, "journey-map.mjs");

function createStubEnvironment(fixtureData) {
	const tmp = mkdtempSync(path.join(tmpdir(), "flisk-journey-map-test-"));
	const binDir = path.join(tmp, "bin");
	const outDir = path.join(tmp, "out");
	mkdirSync(binDir, { recursive: true });
	mkdirSync(outDir, { recursive: true });

	const fixturePath = path.join(tmp, "fixture.json");
	if (fixtureData !== null) {
		writeFileSync(
			fixturePath,
			typeof fixtureData === "string" ? fixtureData : JSON.stringify(fixtureData),
		);
	}

	// Create a deterministic stub for `gh`
	if (process.platform === "win32") {
		const cmdStub = `@echo off
if "%1"=="issue" if "%2"=="list" (
  if exist "%JOURNEY_MAP_FIXTURE_JSON%" (
    type "%JOURNEY_MAP_FIXTURE_JSON%"
    exit /b 0
  )
)
exit /b 1
`;
		writeFileSync(path.join(binDir, "gh.cmd"), cmdStub);
	} else {
		const shStub = `#!/usr/bin/env bash
if [[ "$1" == "issue" && "$2" == "list" ]]; then
  if [[ -f "$JOURNEY_MAP_FIXTURE_JSON" ]]; then
    cat "$JOURNEY_MAP_FIXTURE_JSON"
    exit 0
  fi
fi
exit 1
`;
		const stubPath = path.join(binDir, "gh");
		writeFileSync(stubPath, shStub);
		chmodSync(stubPath, 0o755);
	}

	return {
		tmp,
		binDir,
		outDir,
		fixturePath,
		cleanup() {
			rmSync(tmp, { recursive: true, force: true });
		},
	};
}

function runGenerator(env) {
	return spawnSync(process.execPath, [SCRIPT_PATH, "test-owner/test-repo"], {
		encoding: "utf8",
		env: {
			...process.env,
			PATH: `${env.binDir}${path.delimiter}${process.env.PATH}`,
			JOURNEY_MAP_FIXTURE_JSON: env.fixturePath,
			JOURNEY_MAP_OUT_DIR: env.outDir,
		},
	});
}

test("generates journey and hacktoberfest maps for a two-entry fixture", () => {
	const fixture = [
		{
			number: 101,
			state: "CLOSED",
			labels: [
				{ name: "island: CLI Cove" },
				{ name: "rank: 8 kyu" },
				{ name: "hacktoberfest" },
			],
		},
		{
			number: 102,
			state: "OPEN",
			labels: [
				{ name: "island: Test Atoll" },
				{ name: "rank: 7 kyu" },
				{ name: "hacktoberfest" },
			],
		},
	];

	const env = createStubEnvironment(fixture);
	try {
		const res = runGenerator(env);
		assert.equal(res.status, 0, res.stderr);

		const mapSvgPath = path.join(env.outDir, "map.svg");
		const festSvgPath = path.join(env.outDir, "hacktoberfest.svg");

		assert.equal(existsSync(mapSvgPath), true);
		assert.equal(existsSync(festSvgPath), true);

		const mapSvg = readFileSync(mapSvgPath, "utf8");
		const festSvg = readFileSync(festSvgPath, "utf8");

		// Validate SVG headers and closing tags
		assert.match(mapSvg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
		assert.match(mapSvg, /<\/svg>\s*$/);
		assert.match(festSvg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
		assert.match(festSvg, /<\/svg>\s*$/);

		// Map SVG asserts: titles, counts, island stats
		assert.match(mapSvg, /🗺️ The Flisk Journey/);
		assert.match(mapSvg, /1\/2 quests done/);
		assert.match(mapSvg, /CLI Cove/);
		assert.match(mapSvg, /1\/1 done/);
		assert.match(mapSvg, /Test Atoll/);
		assert.match(mapSvg, /0\/1 done/);

		// Ladder counts in journey map
		assert.match(mapSvg, /8 kyu.*>1 quests</s);
		assert.match(mapSvg, /7 kyu.*>1 quests</s);

		// Hacktoberfest SVG asserts: only islands with hacktoberfest quests are placed
		assert.match(festSvg, /🎃 Flisk Hacktoberfest/);
		assert.match(festSvg, /1 open quests · 1 merged/);
		assert.match(festSvg, /CLI Cove/);
		assert.match(festSvg, /Test Atoll/);
		// Islands without hacktoberfest quests should not be placed in hacktoberfest map
		assert.equal(festSvg.includes("Docs Harbor"), false);

		// Hacktoberfest ladder counts (only open quests counted for ladder)
		assert.match(festSvg, /8 kyu.*>0 open</s);
		assert.match(festSvg, /7 kyu.*>1 open</s);
	} finally {
		env.cleanup();
	}
});

test("renders closed quests as filled circles and open quests as hollow circles", () => {
	const fixture = [
		{
			number: 201,
			state: "CLOSED",
			labels: [{ name: "island: CLI Cove" }, { name: "rank: 8 kyu" }],
		},
		{
			number: 202,
			state: "OPEN",
			labels: [{ name: "island: Test Atoll" }, { name: "rank: 7 kyu" }],
		},
	];

	const env = createStubEnvironment(fixture);
	try {
		const res = runGenerator(env);
		assert.equal(res.status, 0, res.stderr);

		const mapSvg = readFileSync(path.join(env.outDir, "map.svg"), "utf8");

		// Filled circle pattern for closed issue on CLI Cove (#1d76db)
		assert.match(mapSvg, /<circle cx="\d+" cy="\d+" r="6" fill="#1d76db"/);

		// Hollow circle pattern for open issue on Test Atoll (#d4a72c)
		assert.match(mapSvg, /<circle cx="\d+" cy="\d+" r="5\.5" fill="none" stroke="#d4a72c" stroke-width="2"\/>/);
	} finally {
		env.cleanup();
	}
});

test("filters out issues labelled 'tracking' from map and counts", () => {
	const fixture = [
		{
			number: 301,
			state: "OPEN",
			labels: [{ name: "island: CLI Cove" }, { name: "rank: 8 kyu" }],
		},
		{
			number: 302,
			state: "OPEN",
			labels: [{ name: "island: CLI Cove" }, { name: "tracking" }],
		},
	];

	const env = createStubEnvironment(fixture);
	try {
		const res = runGenerator(env);
		assert.equal(res.status, 0, res.stderr);

		const mapSvg = readFileSync(path.join(env.outDir, "map.svg"), "utf8");
		// Only 1 quest should be counted for CLI Cove, not 2
		assert.match(mapSvg, /0\/1 quests done/);
		assert.match(mapSvg, /0\/1 done/);
	} finally {
		env.cleanup();
	}
});

test("escapes special characters in SVG titles, labels, and aria tags", () => {
	const fixture = [
		{
			number: 401,
			state: "OPEN",
			labels: [{ name: "island: CLI Cove" }, { name: "rank: 8 kyu" }],
		},
	];

	const env = createStubEnvironment(fixture);
	try {
		// Run generator targeting a repo string with XML characters to verify esc() behavior
		const res = spawnSync(process.execPath, [SCRIPT_PATH, "flisk-sh/<custom>&repo"], {
			encoding: "utf8",
			env: {
				...process.env,
				PATH: `${env.binDir}${path.delimiter}${process.env.PATH}`,
				JOURNEY_MAP_FIXTURE_JSON: env.fixturePath,
				JOURNEY_MAP_OUT_DIR: env.outDir,
			},
		});
		assert.equal(res.status, 0, res.stderr);

		const mapSvg = readFileSync(path.join(env.outDir, "map.svg"), "utf8");
		assert.equal(mapSvg.includes("<custom>"), false);
	} finally {
		env.cleanup();
	}
});

test("fails with non-zero exit code when gh CLI execution fails", () => {
	const env = createStubEnvironment(null); // No fixture file, stub will exit 1
	try {
		const res = runGenerator(env);
		assert.notEqual(res.status, 0);
	} finally {
		env.cleanup();
	}
});

test("fails when gh CLI returns malformed JSON", () => {
	const env = createStubEnvironment("this is not valid json");
	try {
		const res = runGenerator(env);
		assert.notEqual(res.status, 0);
	} finally {
		env.cleanup();
	}
});

test("does not modify tracked production SVG assets", () => {
	const prodMapPath = path.join(SCRIPT_DIR, "..", "docs", "journey", "map.svg");
	const prodFestPath = path.join(SCRIPT_DIR, "..", "docs", "journey", "hacktoberfest.svg");

	const mapBefore = existsSync(prodMapPath) ? readFileSync(prodMapPath, "utf8") : null;
	const festBefore = existsSync(prodFestPath) ? readFileSync(prodFestPath, "utf8") : null;

	const fixture = [
		{
			number: 501,
			state: "CLOSED",
			labels: [{ name: "island: CLI Cove" }, { name: "rank: 8 kyu" }, { name: "hacktoberfest" }],
		},
	];
	const env = createStubEnvironment(fixture);
	try {
		const res = runGenerator(env);
		assert.equal(res.status, 0, res.stderr);

		const mapAfter = existsSync(prodMapPath) ? readFileSync(prodMapPath, "utf8") : null;
		const festAfter = existsSync(prodFestPath) ? readFileSync(prodFestPath, "utf8") : null;

		assert.equal(mapAfter, mapBefore);
		assert.equal(festAfter, festBefore);
	} finally {
		env.cleanup();
	}
});
