// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the claims-guard scorer, on small fixture repositories.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { measure, parseRules } from "./claims-guard.mjs";
import { read } from "./lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const REGISTRY = `# Public claims registry

| Claim | Allowed wording | Forbidden wording / source |
| --- | --- | --- |
| Demo | “14 services healthy in 4.6s after images existed. Grows from zero services one at a time.” | “from zero”, “cold boot”. |

<!-- claims-guard
forbid: from zero | cold boot
caveat: 4.6s => after images existed | warm start
-->
`;

function fixture(files) {
	const root = mkdtempSync(path.join(tmpdir(), "claims-guard-"));
	for (const [rel, body] of Object.entries({ "docs/claims.md": REGISTRY, ...files })) {
		mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		writeFileSync(path.join(root, rel), body);
	}
	return root;
}

function findings(files) {
	const root = fixture(files);
	try {
		return measure({ root }).findings;
	} finally {
		rmSync(root, { recursive: true });
	}
}

test("a forbidden phrase is reported with its file, line and phrase, whatever its case", () => {
	assert.deepEqual(findings({ "README.md": "# Flisk\n\nIt is a Cold Boot.\n" }), ['README.md:3 "cold boot": forbidden']);
});

test("a forbidden phrase negated right before it is not a violation", () => {
	const text = [
		"Not a cold boot.",
		"This is no cold boot.",
		"It isn't a cold boot, and it isn’t a cold boot either.",
		"It is **not** a cold boot.",
	].join("\n");
	assert.deepEqual(findings({ "README.md": text }), []);
});

test("a forbidden phrase that is part of the registry's allowed wording is not a violation, elsewhere it is", () => {
	const text = "Grows from zero services one at a time.\n\nGet from zero to running.\n";
	assert.deepEqual(findings({ "docs/drafts/post.md": text }), ['docs/drafts/post.md:3 "from zero": forbidden']);
});

test("a forbidden phrase must be whole words: a file name or a longer word does not count", () => {
	assert.deepEqual(findings({ "README.md": "[Cold boots](benchmarks/cold-boot.md) and cold boots.\n" }), []);
});

test("a number needs a caveat within 300 characters; a caveat further away does not count", () => {
	const near = "Healthy in 4.6 s after images existed.\n";
	const far = `Healthy in 4.6 seconds.${" filler".repeat(60)} That was after images existed.\n`;
	assert.deepEqual(findings({ "docs/near.md": near }), []);
	assert.deepEqual(findings({ "docs/far.md": far }), ["docs/far.md:1 4.6s without caveat"]);
});

test("a different number that contains the digits is not the claim", () => {
	assert.deepEqual(findings({ "README.md": "Took 14.6s, then 4.65 s.\n" }), []);
});

test("translations skip the caveat rule but not the forbid rule", () => {
	const text = "14 服务 4.6s.\n\ncold boot\n";
	assert.deepEqual(findings({ "docs/README-zh_cn.md": text, "docs/contributing/translations/x-ja.md": text }), [
		'docs/README-zh_cn.md:3 "cold boot": forbidden',
		'docs/contributing/translations/x-ja.md:3 "cold boot": forbidden',
	]);
	assert.deepEqual(findings({ "docs/drafts/launch.md": text }), [
		"docs/drafts/launch.md:1 4.6s without caveat",
		'docs/drafts/launch.md:3 "cold boot": forbidden',
	]);
});

test("the registry and synced skills are skipped; agent contracts, local skills and npm descriptions are scanned", () => {
	const got = findings({
		"docs/agents/llms.txt": "Healthy in 4.6s.\n",
		".claude/skills/LOCAL": "# authored here\nx\n",
		".claude/skills/x/SKILL.md": "A cold boot.\n",
		".claude/skills/synced/SKILL.md": "A cold boot, fixed in flisk-skills.\n",
		"package.json": '{\n  "name": "x",\n  "description": "Runs from zero."\n}\n',
	});
	assert.deepEqual(got, [
		"docs/agents/llms.txt:1 4.6s without caveat",
		'.claude/skills/x/SKILL.md:1 "cold boot": forbidden',
		'package.json:3 "from zero": forbidden',
	]);
});

test("a registry without a claims-guard block throws instead of passing the gate", () => {
	const root = fixture({ "docs/claims.md": "# Public claims registry\n" });
	try {
		assert.throws(() => measure({ root }), /no claims-guard block/);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("the repository's registry has a claims-guard block with the table's forbidden phrases and caveats", () => {
	const rules = parseRules(read(repoRoot, "docs/claims.md"));
	assert.ok(rules);
	for (const phrase of ["weeks of integration", "ERP system", "weeks of salary", "under 5 seconds"])
		assert.ok(rules.forbid.includes(phrase), phrase);
	// "cold boot" and "from zero" are forbidden for the 14-service number only; the 4.6s caveat covers them, and the
	// cold-boot benchmarks use the words for what they measured.
	assert.ok(!rules.forbid.includes("cold boot"));
	assert.deepEqual(
		rules.caveats.map((c) => c.subject),
		["4.6s", "472s", "100 services still readable", "49 s"],
	);
});
