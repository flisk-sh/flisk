// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the json-coverage scorer, on fixture repos whose cli/dist/program.js is built with the real Commander.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { measure } from "./json-coverage.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const commander = pathToFileURL(createRequire(path.join(repoRoot, "cli/package.json")).resolve("commander")).href;

const program = (body) => `import { Command } from ${JSON.stringify(commander)};
export function createProgram() {
	const program = new Command("flisk").version("1.0.0", "-v, --version");
	${body}
	return program;
}
`;

function fixture(files) {
	const root = mkdtempSync(path.join(tmpdir(), "json-coverage-"));
	// cli/package.json makes the fake cli/dist ES modules, as in the real package.
	for (const [rel, body] of Object.entries({ "cli/package.json": '{ "type": "module" }', ...files })) {
		mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		writeFileSync(path.join(root, rel), body);
	}
	return root;
}

test("leaf commands count, human-only and interactive ones do not, and only an exact --json covers", async () => {
	const root = fixture({
		"cli/dist/program.js": program(`
			program.command("status").option("--json");
			program.command("logs").option("--tail <n>");
			program.command("networks").option("--json-legacy");
			const config = program.command("config");
			config.command("verify").option("--json");
			config.command("edit");
			program.command("ui");
			program.command("maintainers").command("check");
		`),
	});
	try {
		const result = await measure({ root });
		assert.equal(result.value, 50);
		assert.equal(result.summary, "2 of 4 leaf commands accept --json");
		assert.deepEqual(result.findings, ["flisk logs has no --json", "flisk networks has no --json"]);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("a missing CLI build is an error, not a silent pass", async () => {
	const root = fixture({ "README.md": "x" });
	try {
		await assert.rejects(async () => measure({ root }), /cli\/dist/);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("this repository: a stable percentage", async () => {
	const first = await measure({ root: repoRoot });
	assert.ok(first.value > 0 && first.value <= 100);
	assert.deepEqual(await measure({ root: repoRoot }), first);
});
