// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the readme-first-screen scorer, on small fixture repositories.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
	IMAGE_WITHIN_LINES,
	INSTALL_WITHIN_LINES,
	MAX_BADGES_BEFORE_CODE,
	MAX_PROSE_WORDS_BEFORE_CODE,
	measure,
	proseWords,
} from "./readme-first-screen.mjs";

function run(readme) {
	const root = mkdtempSync(path.join(tmpdir(), "readme-first-screen-"));
	try {
		writeFileSync(path.join(root, "README.md"), readme);
		return measure({ root });
	} finally {
		rmSync(root, { recursive: true });
	}
}

const shield = (n) => `[![b${n}](https://img.shields.io/badge/b-${n}-blue)](https://x)`;

test("a README with a title, picture, few badges, short pitch and install command passes all five", () => {
	const readme = [
		'<div align="center">',
		"",
		"# Flisk: your stack, locally",
		"",
		'<img src="docs/assets/demo.svg" alt="demo">',
		"",
		`${shield(1)} ${shield(2)}`,
		"",
		"</div>",
		"",
		"```bash",
		"npm install -g @flisk-sh/flisk",
		"```",
	].join("\n");
	const r = run(readme);
	assert.equal(r.value, 5);
	assert.equal(r.max, 5);
	assert.deepEqual(r.findings, []);
});

test("each failing check is reported with what was measured", () => {
	const readme = [
		"intro",
		"",
		"more intro",
		"",
		"text",
		"",
		"text",
		"",
		"text",
		"",
		"# Flisk",
		Array.from({ length: MAX_BADGES_BEFORE_CODE + 1 }, (_, i) => shield(i)).join(" "),
		"word ".repeat(MAX_PROSE_WORDS_BEFORE_CODE),
		...Array.from({ length: Math.max(IMAGE_WITHIN_LINES, INSTALL_WITHIN_LINES) }, () => ""),
		"![late](docs/assets/demo.svg)",
		"```bash",
		"npm install -g @flisk-sh/flisk",
		"```",
	].join("\n");
	const r = run(readme);
	assert.equal(r.value, 0);
	assert.deepEqual(r.findings, [
		"H1 near the top: non-empty line 6 (within 5 non-empty lines)",
		"install command: line 56 (within 40 lines)",
		"image: line 54 (within 20 lines)",
		"badges before the first code block: 7 (at most 6)",
		"prose words before the first code block: 257 (at most 250)",
	]);
});

test("a badge is not the picture and another tool's curl installer is not the install command", () => {
	const readme = [
		"# Flisk",
		shield(1),
		"```bash",
		"curl -fsSL https://claude.ai/install.sh | bash",
		"```",
		"",
		"```bash",
		"curl -fsSL https://flisk.sh/install.sh | sh",
		"```",
	].join("\n");
	const r = run(readme);
	assert.deepEqual(r.findings, ["image: none (within 20 lines)"]);
	assert.match(r.summary, /install command: line 8/);
});

test("a flisk curl installer counts whichever shell it pipes into", () => {
	for (const shell of ["sh", "bash", "zsh"]) {
		const r = run(`# Flisk\n\n\`\`\`bash\ncurl -fsSL https://flisk.sh/install.sh | ${shell}\n\`\`\`\n`);
		assert.match(r.summary, /install command: line 4;/, shell);
	}
	assert.match(run("# Flisk\n\ncurl -fsSL https://flisk.sh/install.sh | shellcheck\n").summary, /install command: none/);
});

test("a # comment inside a code block is not the H1", () => {
	const r = run("```bash\n# install\nnpm install -g @flisk-sh/flisk\n```\n\n# Flisk\n![demo](demo.svg)\n");
	assert.match(r.summary, /H1 near the top: non-empty line 5;/);
	const late = run("```bash\n# install\n```\n\n## A\n\n## B\n\n# Flisk\n");
	assert.ok(late.findings.includes("H1 near the top: non-empty line 6 (within 5 non-empty lines)"));
});

test("prose words skip HTML tags, images, badges and link targets but keep link text", () => {
	const md = `<p align="center"><sub>Two words</sub></p>\n${shield(1)} ![alt text](x.png)\nSee [the docs](https://flisk.sh/docs) · now <!-- hidden words -->`;
	assert.equal(proseWords(md), 6);
});
