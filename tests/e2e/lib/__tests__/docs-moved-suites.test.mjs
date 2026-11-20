// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkMovedSuiteDocs, GUIDES, movedSuites } from "../docs-moved-suites.mjs";

const repo = fileURLToPath(new URL("../../../..", import.meta.url));

function fixture(names) {
	const root = mkdtempSync(path.join(tmpdir(), "moved-suites-"));
	for (const name of names) {
		const dir = path.join(root, "tests", "e2e", "resource-types", name);
		mkdirSync(dir, { recursive: true });
		writeFileSync(path.join(dir, "suite.json"), "{}");
	}
	for (const guide of GUIDES) {
		const file = path.join(root, guide);
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(
			file,
			`# guide\n\n\`resource-types\` has ${names.length} moved suites: ${names.map((name) => `\`${name}\``).join(", ")}.\n`,
		);
	}
	return root;
}

const names = ["agent", "backend", "bring-your-own", "combined", "frontend", "library", "mcp", "migrator", "sdk", "worker"];

test("a guide whose list matches the suite folders passes", () => {
	assert.deepEqual(checkMovedSuiteDocs(fixture(names)), []);
});

test("a stale claim that only one suite moved is reported", () => {
	const root = fixture(names);
	const guide = path.join(root, GUIDES[0]);
	writeFileSync(guide, `# guide\n\nOnly \`resource-types/agent\` has moved so far.\n`);
	const problems = checkMovedSuiteDocs(root).join("\n");
	assert.match(problems, new RegExp(`${GUIDES[0]}: stale`));
	assert.match(problems, /expected exactly one line listing all 10 moved suites/);
});

test("a new suite folder makes an out-of-date guide fail", () => {
	const root = fixture(names);
	const dir = path.join(root, "tests", "e2e", "resource-types", "new-suite");
	mkdirSync(dir, { recursive: true });
	writeFileSync(path.join(dir, "suite.json"), "{}");
	const problems = checkMovedSuiteDocs(root);
	assert.equal(problems.length, GUIDES.length);
	for (const problem of problems) assert.match(problem, /`new-suite`/);
});

test("the repository guides list every current resource-types suite", () => {
	assert.deepEqual(movedSuites(repo), names);
	assert.deepEqual(checkMovedSuiteDocs(repo), []);
});
