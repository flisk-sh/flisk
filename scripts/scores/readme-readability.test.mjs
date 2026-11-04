// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { jargon, measure, prose, readingEase, syllables } from "./readme-readability.mjs";

test("prose drops code, HTML, tables, images and link targets", () => {
	const md = [
		"# Title",
		'<p align="center"><img src="x.svg"></p>',
		"Run `flisk up` to start. See [the docs](https://flisk.sh/docs).",
		"```bash\nnpm install -g @flisk-sh/flisk\n```",
		"| a | b |",
		"| - | - |",
		"- a list item",
	].join("\n");
	assert.equal(prose(md), "Title. Run to start. See the docs. a list item.");
});

test("syllables counts vowel groups and drops a silent e", () => {
	assert.deepEqual(["app", "laptop", "code", "agent", "the", "readable"].map(syllables), [1, 2, 1, 2, 1, 3]);
});

test("short plain sentences read easier than long technical ones", () => {
	const plain = readingEase("Your agent builds the app. Flisk runs it. You see it in your browser.");
	const dense = readingEase(
		"Declarative orchestration of heterogeneous containerized microservices necessitates comprehensive configuration management infrastructure.",
	);
	assert.ok(plain > 80, String(plain));
	assert.ok(dense < 10, String(dense));
	assert.equal(readingEase("```\ncode only\n```"), null);
});

test("jargon counts infrastructure words in prose only", () => {
	const j = jargon("Docker and Tilt run your containers. Docker again.\n```\ndocker compose up\n```");
	assert.deepEqual(j.counts, [["docker", 2], ["containers", 1], ["tilt", 1]]);
	assert.equal(j.share, 50);
});

test("measure reads README.md", () => {
	const root = mkdtempSync(path.join(tmpdir(), "readability-"));
	writeFileSync(path.join(root, "README.md"), "Your agent builds the app. Docker is optional.");
	const r = measure({ root });
	assert.equal(typeof r.value, "number");
	assert.equal(r.summary, "8 words; 12.5% infrastructure words");
	assert.deepEqual(r.findings, ['"docker" 1×']);
});
