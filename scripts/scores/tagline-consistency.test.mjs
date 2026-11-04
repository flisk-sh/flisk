// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the tagline-consistency scorer, on small fixture repositories.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { firstH1, measure, normalise } from "./tagline-consistency.mjs";

function fixture(files) {
	const root = mkdtempSync(path.join(tmpdir(), "tagline-consistency-"));
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

const pkg = (description) => JSON.stringify({ name: "x", description });

test("the same tagline behind different prefixes, case and punctuation counts once", () => {
	assert.equal(normalise("Flisk: Your stack, locally."), "your stack locally");
	assert.equal(normalise("Flisk CLI — your stack locally"), "your stack locally");
	assert.equal(normalise("Flisk is [your stack](https://x) locally!"), "your stack locally");
	const r = run({
		"README.md": "<div>\n\n# Flisk: Your stack, locally\n",
		"package.json": pkg("Flisk CLI — your stack locally."),
		"cli/package.json": pkg("Flisk CLI — your stack locally."),
		"docs/agents/llms.txt": "# Flisk\n\n> Flisk is your stack, locally.\n",
		"docs/agents/llms-full.txt": "# Flisk\n\n> Your stack locally\n",
	});
	assert.equal(r.value, 1);
});

test("every source is listed, a missing one as (none), and different wording counts as another tagline", () => {
	const r = run({
		"README.md": "# Flisk: your stack, locally\n",
		"package.json": pkg("Flisk CLI — start services on your machine."),
		"docs/agents/llms.txt": "> Flisk is the local runtime for agents.\n",
	});
	assert.equal(r.value, 3);
	assert.deepEqual(r.findings, [
		"README.md H1: Flisk: your stack, locally",
		"package.json description: Flisk CLI — start services on your machine.",
		"cli/package.json description: (none)",
		"docs/agents/llms.txt: Flisk is the local runtime for agents.",
		"docs/agents/llms-full.txt: (none)",
	]);
});

test("each launch post's H1 is a source when docs/launch exists", () => {
	const r = run({
		"README.md": "# Flisk: your stack, locally\n",
		"docs/launch/product-hunt.md": "```bash\n# not a heading\n```\n\n# Flisk — one command for your stack\n",
		"docs/launch/x.md": "# Your stack, locally\n",
	});
	assert.equal(r.value, 2);
	assert.ok(r.findings.includes("docs/launch/product-hunt.md H1: Flisk — one command for your stack"));
	assert.ok(r.findings.includes("docs/launch/x.md H1: Your stack, locally"));
});

test("firstH1 skips comments inside code fences and reads an <h1> element", () => {
	assert.equal(firstH1("```bash\n# install\n```\n# Real title\n"), "Real title");
	assert.equal(firstH1('<h1 align="center">Flisk</h1>\n'), "Flisk");
	assert.equal(firstH1("## Only a subheading\n"), null);
});

test("a repository with no tagline anywhere has no data", () => {
	assert.equal(run({ "README.md": "no heading\n" }).value, null);
});
