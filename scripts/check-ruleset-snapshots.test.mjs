// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit and integration tests for scripts/check-ruleset-snapshots.mjs.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compareRuleset } from "./check-ruleset-snapshots.mjs";

const scriptPath = fileURLToPath(new URL("check-ruleset-snapshots.mjs", import.meta.url));

function createValidRuleset(name, refPattern) {
	return {
		name,
		target: "branch",
		enforcement: "active",
		bypass_actors: [],
		conditions: {
			ref_name: {
				exclude: [],
				include: [refPattern],
			},
		},
		rules: [
			{ type: "deletion" },
			{
				type: "pull_request",
				parameters: {
					required_approving_review_count: 1,
				},
			},
		],
	};
}

function withFixture(fn) {
	const tempDir = realpathSync(mkdtempSync(join(tmpdir(), "flisk-ruleset-test-")));
	try {
		const binDir = join(tempDir, "bin");
		const scriptsDir = join(tempDir, "scripts");
		const rulesetsDir = join(tempDir, ".github", "rulesets");

		mkdirSync(binDir, { recursive: true });
		mkdirSync(scriptsDir, { recursive: true });
		mkdirSync(rulesetsDir, { recursive: true });

		copyFileSync(scriptPath, join(scriptsDir, "check-ruleset-snapshots.mjs"));

		// Create a stub `gh` binary that responds using data in MOCK_DATA_FILE
		const ghScript = `#!/usr/bin/env node
import { readFileSync } from "node:fs";
const [, , cmd, endpoint] = process.argv;
if (cmd !== "api") {
	console.error("Unknown mock gh command: " + cmd);
	process.exit(1);
}
const mockData = JSON.parse(readFileSync(process.env.MOCK_DATA_FILE, "utf8"));
if (endpoint.includes("per_page=100")) {
	console.log(JSON.stringify(mockData.summaries));
	process.exit(0);
}
const match = endpoint.match(/\\/rulesets\\/(\\d+)$/);
if (match) {
	const id = Number(match[1]);
	const detail = mockData.details[id];
	if (detail) {
		console.log(JSON.stringify(detail));
		process.exit(0);
	}
}
console.error("Mock gh endpoint not found: " + endpoint);
process.exit(1);
`;
		const ghPath = join(binDir, "gh");
		writeFileSync(ghPath, ghScript, { mode: 0o755 });
		chmodSync(ghPath, 0o755);

		const runScript = () => {
			return spawnSync(process.execPath, [join(scriptsDir, "check-ruleset-snapshots.mjs")], {
				cwd: tempDir,
				env: {
					...process.env,
					PATH: `${binDir}:${process.env.PATH}`,
					MOCK_DATA_FILE: join(tempDir, "mock-gh.json"),
					GITHUB_REPOSITORY: "flisk-sh/flisk",
				},
				encoding: "utf8",
			});
		};

		return fn({ tempDir, rulesetsDir, runScript });
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

test("compareRuleset: identical snapshots produce no mismatches", () => {
	const a = createValidRuleset("main ruleset", "refs/heads/main");
	const b = createValidRuleset("main ruleset", "refs/heads/main");
	assert.deepEqual(compareRuleset(a, b), []);
});

test("compareRuleset: detects altered rules and parameters", () => {
	const snapshot = createValidRuleset("main ruleset", "refs/heads/main");
	const live = createValidRuleset("main ruleset", "refs/heads/main");
	live.rules = [{ type: "deletion" }]; // missing pull_request rule
	assert.deepEqual(compareRuleset(snapshot, live), ["rules"]);
});

test("compareRuleset: detects altered enforcement, bypass_actors, conditions, name", () => {
	const snapshot = createValidRuleset("main ruleset", "refs/heads/main");
	const live = {
		...snapshot,
		enforcement: "disabled",
		name: "renamed ruleset",
	};
	assert.deepEqual(compareRuleset(snapshot, live), ["name", "enforcement"]);
});

test("Case A — Matching snapshot: exits 0 when all snapshots match live rulesets", () => {
	withFixture(({ tempDir, rulesetsDir, runScript }) => {
		const mainSnapshot = createValidRuleset("main merge queue", "refs/heads/main");
		const releasesSnapshot = createValidRuleset("release branch protections", "refs/heads/release/*");

		writeFileSync(join(rulesetsDir, "main.json"), JSON.stringify(mainSnapshot, null, 2));
		writeFileSync(join(rulesetsDir, "releases.json"), JSON.stringify(releasesSnapshot, null, 2));

		const mockData = {
			summaries: [
				{ id: 10, name: "main merge queue" },
				{ id: 20, name: "release branch protections" },
			],
			details: {
				10: mainSnapshot,
				20: releasesSnapshot,
			},
		};
		writeFileSync(join(tempDir, "mock-gh.json"), JSON.stringify(mockData));

		const result = runScript();
		assert.equal(result.status, 0, `Expected 0, got error: ${result.stderr}`);
		assert.match(result.stdout, /2 ruleset snapshots match live GitHub rulesets/);
	});
});

test("Case B — Changed rule: exits 1 and reports differences when rules differ", () => {
	withFixture(({ tempDir, rulesetsDir, runScript }) => {
		const mainSnapshot = createValidRuleset("main merge queue", "refs/heads/main");
		const releasesSnapshot = createValidRuleset("release branch protections", "refs/heads/release/*");

		writeFileSync(join(rulesetsDir, "main.json"), JSON.stringify(mainSnapshot, null, 2));
		writeFileSync(join(rulesetsDir, "releases.json"), JSON.stringify(releasesSnapshot, null, 2));

		// Live main ruleset has a modified rule
		const liveMain = {
			...mainSnapshot,
			rules: [
				{ type: "deletion" },
				{
					type: "pull_request",
					parameters: {
						required_approving_review_count: 2, // Changed from 1 to 2
					},
				},
			],
		};

		const mockData = {
			summaries: [
				{ id: 10, name: "main merge queue" },
				{ id: 20, name: "release branch protections" },
			],
			details: {
				10: liveMain,
				20: releasesSnapshot,
			},
		};
		writeFileSync(join(tempDir, "mock-gh.json"), JSON.stringify(mockData));

		const result = runScript();
		assert.equal(result.status, 1);
		assert.match(result.stderr, /main\.json: live ruleset differs in rules/);
	});
});

test("Case B (variant) — Live ruleset missing: exits 1 when live ruleset is not found on GitHub", () => {
	withFixture(({ tempDir, rulesetsDir, runScript }) => {
		const mainSnapshot = createValidRuleset("main merge queue", "refs/heads/main");
		const releasesSnapshot = createValidRuleset("release branch protections", "refs/heads/release/*");

		writeFileSync(join(rulesetsDir, "main.json"), JSON.stringify(mainSnapshot, null, 2));
		writeFileSync(join(rulesetsDir, "releases.json"), JSON.stringify(releasesSnapshot, null, 2));

		const mockData = {
			summaries: [
				{ id: 10, name: "main merge queue" },
				// releases ruleset missing from summaries
			],
			details: {
				10: mainSnapshot,
			},
		};
		writeFileSync(join(tempDir, "mock-gh.json"), JSON.stringify(mockData));

		const result = runScript();
		assert.equal(result.status, 1);
		assert.match(result.stderr, /releases\.json: live ruleset 'release branch protections' was not found/);
	});
});

test("Case C — Missing snapshot: exits 1 when a snapshot file is absent from disk", () => {
	withFixture(({ tempDir, rulesetsDir, runScript }) => {
		const mainSnapshot = createValidRuleset("main merge queue", "refs/heads/main");
		// Write main.json, but omit releases.json
		writeFileSync(join(rulesetsDir, "main.json"), JSON.stringify(mainSnapshot, null, 2));

		const mockData = {
			summaries: [
				{ id: 10, name: "main merge queue" },
				{ id: 20, name: "release branch protections" },
			],
			details: {
				10: mainSnapshot,
				20: createValidRuleset("release branch protections", "refs/heads/release/*"),
			},
		};
		writeFileSync(join(tempDir, "mock-gh.json"), JSON.stringify(mockData));

		const result = runScript();
		assert.equal(result.status, 1);
		assert.match(result.stderr, /ENOENT/);
	});
});
