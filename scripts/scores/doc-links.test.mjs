// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the doc-links scorer, on small fixture repositories.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { existsExact, linkPath, links, markdownFiles, measure } from "./doc-links.mjs";

function fixture(files) {
	const root = mkdtempSync(path.join(tmpdir(), "doc-links-"));
	for (const [rel, body] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		writeFileSync(path.join(root, rel), body);
	}
	return root;
}

function run(files, allowed = []) {
	const root = fixture(files);
	try {
		return measure({ root }, allowed);
	} finally {
		rmSync(root, { recursive: true });
	}
}

test("links finds inline, image, reference and HTML links with their line, not code", () => {
	const md = [
		"See [a](a.md) and ![b](img/b.png \"title\").",
		"[c](<with space.md>) [d]: not a definition",
		"[e]: ./e.md",
		'<a href="f.md">f</a> <img alt="g" src=\'g.svg\'>',
		"`[h](h.md)` and ``[i](i.md)``",
		"```md",
		"[j](j.md)",
		"```",
		"[k](k.md)",
	].join("\n");
	assert.deepEqual(links(md), [
		{ line: 1, target: "a.md" },
		{ line: 1, target: "img/b.png" },
		{ line: 2, target: "with space.md" },
		{ line: 3, target: "./e.md" },
		{ line: 4, target: "f.md" },
		{ line: 4, target: "g.svg" },
		{ line: 9, target: "k.md" },
	]);
});

test("linkPath resolves relative and root links and leaves URLs, anchors and templates alone", () => {
	assert.equal(linkPath("docs/a/b.md", "../c.md#part"), "docs/c.md");
	assert.equal(linkPath("docs/a.md", "./x.md?plain=1"), "docs/x.md");
	assert.equal(linkPath("README.md", "docs/a%20b.md"), "docs/a b.md");
	assert.equal(linkPath("docs/a.md", "/cli/README.md"), "cli/README.md");
	assert.equal(linkPath("docs/a.md", "../../up.md"), "../up.md");
	for (const t of ["https://x.dev/a.md", "mailto:a@b.c", "vscode://x", "//cdn/x.js", "#anchor", "{{ link }}", "<name>.md", "${dir}/a.md", ""])
		assert.equal(linkPath("docs/a.md", t), null, t);
});

test("existsExact needs the exact case and stays inside the root", () => {
	const root = fixture({ "docs/Guide.md": "x" });
	try {
		assert.equal(existsExact(root, "docs/Guide.md"), true);
		assert.equal(existsExact(root, "docs/"), true);
		assert.equal(existsExact(root, "docs/guide.md"), false);
		assert.equal(existsExact(root, "../docs/Guide.md"), false);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("a missing target, a wrong case and a path outside the repo are findings; files and folders that exist are not", () => {
	const r = run({
		"README.md": "[ok](docs/guide.md) [dir](docs/) [root](/docs/guide.md#x) [gone](docs/gone.md)\n",
		"docs/guide.md": "[up](../README.md)\n\n[case](../readme.md) [out](../../other/x.md)\n",
	});
	assert.deepEqual(r.findings, [
		"README.md:1 docs/gone.md: docs/gone.md does not exist",
		"docs/guide.md:3 ../readme.md: readme.md does not exist",
		"docs/guide.md:3 ../../other/x.md: points outside the repository",
	]);
	assert.equal(r.value, 3);
	assert.equal(r.summary, "7 relative links in 2 Markdown files, 3 broken");
});

test("the scope: READMEs and AGENTS.md anywhere, docs/cli/examples/scripts/runtime/tests Markdown and local skills only", () => {
	const root = fixture({
		"README.md": "",
		"runtime/x/AGENTS.md": "",
		"runtime/x/notes.md": "",
		"docs/a.md": "",
		"docs/CHANGELOG.md": "",
		"docs/benchmarks/results/r.md": "",
		"openspec/changes/c.md": "",
		"cli/engine/AGENTS.md": "",
		"cli/templates/agent-skills/s/SKILL.md": "",
		"examples/e/README.md": "",
		"node_modules/p/README.md": "",
		"tests/t.md": "",
		".claude/skills/LOCAL": "# local\nmine\n",
		".claude/skills/mine/SKILL.md": "",
		".claude/skills/synced/SKILL.md": "",
		".claude/worktrees/w/README.md": "",
	});
	try {
		assert.deepEqual(markdownFiles(root), [
			".claude/skills/mine/SKILL.md",
			"README.md",
			"docs/a.md",
			"examples/e/README.md",
			"runtime/x/AGENTS.md",
			"runtime/x/notes.md",
			"tests/t.md",
		]);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("ALLOWED clears a broken link and goes stale loudly", () => {
	const allowed = [{ file: "docs/a.md", target: "gen.md", reason: "written by a build step" }];
	assert.deepEqual(run({ "docs/a.md": "[g](gen.md)\n" }, allowed).findings, []);
	assert.deepEqual(run({ "docs/a.md": "" }, allowed).findings, [
		"docs/a.md gen.md: ALLOWED entry no longer matches a broken link; remove it",
	]);
});
