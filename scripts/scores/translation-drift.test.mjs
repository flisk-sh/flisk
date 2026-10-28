// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the translation-drift scorer, on small fixture repositories.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { drift, measure, quickstart, shellCommands } from "./translation-drift.mjs";

function fixture(files) {
	const root = mkdtempSync(path.join(tmpdir(), "translation-drift-"));
	for (const [rel, body] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		writeFileSync(path.join(root, rel), body);
	}
	return root;
}

function run(files) {
	const root = fixture(files);
	try {
		return measure({ root });
	} finally {
		rmSync(root, { recursive: true });
	}
}

const block = (...lines) => `\`\`\`bash\n${lines.join("\n")}\n\`\`\`\n`;
const ENGLISH = `# Flisk\n\n${block("npm install -g @flisk-sh/flisk")}\n## In your terminal\n\n${block(
	"npm install -g @flisk-sh/flisk",
	"mkdir my-shop && cd my-shop",
	"flisk project --yes",
	"flisk resource orders-api --type backend --stack shop --yes",
	"flisk resource shop-web --type frontend --stack shop --yes",
	"flisk up shop",
)}`;

test("the quickstart is the first shell block that runs flisk up", () => {
	assert.equal(quickstart(ENGLISH).line, 10);
	assert.equal(quickstart("```text\nflisk up\n```\n"), null);
	// The Compose path at the top of the English README is not the quickstart the translations carry.
	const composeFirst = "```bash\nflisk import .\nflisk up\n```\n\n```bash\nflisk project --yes\nflisk up\n```\n";
	assert.match(quickstart(composeFirst).body, /flisk project --yes/);
});

test("a translation with the same commands and another directory name does not drift", () => {
	const uk = block(
		"npm install -g @flisk-sh/flisk",
		"mkdir shop && cd shop",
		"",
		"# коментар",
		"flisk project --yes",
		"flisk resource orders-api --type backend --stack shop --yes",
		"flisk resource shop-web --type frontend --stack shop --yes",
		"flisk up shop",
	);
	const r = run({ "README.md": ENGLISH, "docs/README-uk.md": `# Flisk\n\n${uk}` });
	assert.equal(r.value, 0);
	assert.deepEqual(r.findings, []);
});

test("a translation that lost a command drifts and names the command", () => {
	const old = block(
		"npm install -g @flisk-sh/flisk",
		"mkdir shop && cd shop",
		"flisk project --yes",
		"flisk resource orders-api --type backend --stack shop --yes",
		"flisk up shop",
	);
	const r = run({ "README.md": ENGLISH, "docs/README-uk.md": old, "docs/README-de.md": ENGLISH });
	assert.equal(r.value, 1);
	assert.deepEqual(r.findings, ['docs/README-uk.md: missing "flisk resource shop-web --type frontend --stack shop --yes"']);
});

test("a translation with no quickstart drifts", () => {
	const r = run({ "README.md": ENGLISH, "docs/README-ja.md": "# Flisk\n\nnpm install -g @flisk-sh/flisk\n" });
	assert.equal(r.value, 1);
	assert.deepEqual(r.findings, ["docs/README-ja.md: no quickstart (no shell block runs flisk up)"]);
});

test("an extra command and a changed order are drift too", () => {
	const en = block("flisk project --yes", "flisk up shop");
	assert.deepEqual(drift(en, block("flisk project --yes", "flisk doctor", "flisk up shop")), ['extra "flisk doctor"']);
	assert.deepEqual(drift(en, block("flisk up shop", "flisk project --yes")), ["same commands in a different order"]);
});

test("shellCommands splits && and ;, joins continuations and drops comments and prompts", () => {
	assert.deepEqual(shellCommands("mkdir a && cd a; ls\n\n# note\n$ flisk up \\\n  shop  # start\n"), [
		"mkdir a",
		"cd a",
		"ls",
		"flisk up shop",
	]);
});

test("a README without a quickstart is an error, not a pass", () => {
	assert.throws(() => run({ "README.md": "# Flisk\n" }), /no shell block that runs flisk up/);
});
