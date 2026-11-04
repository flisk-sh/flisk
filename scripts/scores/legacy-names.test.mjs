// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the legacy-names scorer, on small fixture repositories.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { INTENTIONAL, LEGACY, measure, meta } from "./legacy-names.mjs";

function run(files, intentional = []) {
	const root = mkdtempSync(path.join(tmpdir(), "legacy-names-"));
	try {
		for (const [rel, body] of Object.entries(files)) {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), body);
		}
		return measure({ root }, intentional);
	} finally {
		rmSync(root, { recursive: true });
	}
}

test("each old name is a finding with path:line and the text", () => {
	const r = run({
		"docs/a.md": "fine\nexport TDK_HOME=1\n",
		"scripts/b.sh": "rm -rf ~/.tdk\n",
		"cli/c.ts": 'const pkg = "@tdk-landscape/tdk-cli-core";\n',
		"AGENTS.md": "Flisk (Topology Development Kit) runs things.\n",
		".github/workflows/d.yml": "run: tdk up\n",
	});
	assert.equal(r.value, 5);
	assert.deepEqual(r.findings.map((f) => f.split(" ")[0]).sort(), [
		".github/workflows/d.yml:1",
		"AGENTS.md:1",
		"cli/c.ts:1",
		"docs/a.md:2",
		"scripts/b.sh:1",
	]);
	assert.match(r.findings.find((f) => f.startsWith("docs/a.md")), /TDK_HOME/);
});

test("a clean repo scores zero", () => {
	assert.equal(run({ "README.md": "# Flisk\nflisk up\n", "a.sh": "echo flisk\n" }).value, 0);
});

test("the pattern needs tdk to stand alone, so base64 and longer words do not match", () => {
	assert.equal(LEGACY.test("aGVsbG8tdGRr/Xtdk9=="), false);
	assert.equal(LEGACY.test("see tdk-cli"), true);
	assert.equal(LEGACY.test("_tdk completion"), true);
	assert.equal(LEGACY.test("`TDK_ROOT`"), true);
});

test("history, benchmark results, openspec, lockfiles, synced copies and binary-ish files are skipped", () => {
	const r = run({
		"docs/CHANGELOG.md": "renamed tdk to flisk\n",
		"openspec/changes/archive/x/tasks.md": "TDK_FOO\n",
		"docs/benchmarks/results/tdk-up-warm-start-1/a.txt": "tdk-restaurant-example\n",
		"package-lock.json": '"tdk-cli"\n',
		"docs/assets/demo.svg": "<svg>tdk</svg>\n",
		"cli/engine/x.star": "# tdk-erp-system\n",
		".claude/worktrees/agent-1/README.md": "tdk\n",
		"scripts/scores/legacy-names.mjs": "TDK_\n",
		"node_modules/pkg/index.js": "tdk\n",
	});
	assert.deepEqual(r.findings, []);
});

test("a very long line is embedded data and not scanned", () => {
	assert.equal(run({ "docs/a.md": `${"x".repeat(1600)} tdk\n` }).value, 0);
});

test("an INTENTIONAL entry hides its line only in its file and only for its pattern", () => {
	const entry = [{ file: "cli/x.ts", line: /tdk-landscape/, reason: "legacy package" }];
	const r = run(
		{
			"cli/x.ts": 'const a = "@tdk-landscape/pkg";\nconst b = "TDK_X";\n',
			"cli/y.ts": 'const a = "@tdk-landscape/pkg";\n',
		},
		entry,
	);
	assert.deepEqual(
		r.findings.map((f) => f.split(" ")[0]),
		["cli/x.ts:2", "cli/y.ts:1"],
	);
});

test("an INTENTIONAL entry that matches nothing is a finding, so the list goes stale loudly", () => {
	const r = run({ "README.md": "flisk\n" }, [{ file: "cli/x.ts", line: /tdk/, reason: "old" }]);
	assert.equal(r.value, 1);
	assert.match(r.findings[0], /^cli\/x\.ts .*INTENTIONAL entry no longer matches a line; remove it$/);
});

test("every shipped INTENTIONAL entry names a reason and a file", () => {
	assert.ok(INTENTIONAL.length > 0);
	for (const e of INTENTIONAL) {
		assert.ok(e.reason.length > 10, e.file);
		assert.ok(e.line instanceof RegExp, e.file);
	}
	assert.equal(meta.id, "legacy-names");
});

test("the real repo has no stale INTENTIONAL entry", () => {
	const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
	const stale = measure({ root }).findings.filter((f) => f.includes("INTENTIONAL entry"));
	assert.deepEqual(stale, []);
});
