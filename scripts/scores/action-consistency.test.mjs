// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the action-consistency scorer, on fixture repos.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { analyse, measure, usesLines, withoutExpected } from "./action-consistency.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const A = "a".repeat(40);
const B = "b".repeat(40);
const wf = (file, body, perms = "permissions: {}\n") => ({ file: `.github/workflows/${file}`, text: `name: x\non: push\n${perms}jobs:\n${body}` });
const job = (id, runs, steps) => `  ${id}:\n    runs-on: ${runs}\n    steps:\n${steps}`;

test("usesLines skips local actions and commented uses", () => {
	const t = `# uses: x/y@<sha>\n      - uses: ./.github/actions/a\n      - uses: o/r/sub@${A} # v1\n`;
	assert.deepEqual(usesLines("f", t).map((u) => [u.target, u.comment]), [["o/r/sub", "v1"]]);
});

test("pins: unpinned, missing comment, different SHAs and comment-only variants", () => {
	const s = (u) => `      - uses: ${u}\n`;
	const f = analyse([
		wf("a.yml", job("j", "ubuntu-26.04", s(`o/one@v3`) + s(`o/two@${A}`) + s(`o/three@${A} # v1`) + s(`o/three@${B} # v2`) + s(`o/four@${A} # v1`) + s(`o/four@${A} # v1.0.2`))),
	]);
	assert.deepEqual(f, [
		"o/one@v3 is not pinned to a 40-hex SHA".replace(/^/, ".github/workflows/a.yml:8: "),
		`.github/workflows/a.yml:9: o/two@aaaaaaa has no \`# vN\` version comment`,
		"o/three: different SHAs: aaaaaaa # v1 x1, bbbbbbb # v2 x1",
		"o/four: same SHA, different version comments: aaaaaaa # v1 x1, aaaaaaa # v1.0.2 x1",
	]);
});

test("node-version, runs-on families and permissions", () => {
	const node = (v) => `      - uses: o/setup@${A} # v1\n        with:\n          node-version: ${v}\n`;
	const f = analyse([
		wf("a.yml", job("j1", "ubuntu-26.04", node(22)) + job("j2", "ubuntu-26.04", node(22)) + job("j3", "ubuntu-latest", node("24.15.0")) + job("j4", "windows-latest", node("${{ matrix.n }}")) + job("j5", "${{ matrix.os }}", node(22)), ""),
		wf("b.yml", job("j1", "ubuntu-26.04", node(22))),
	]);
	assert.deepEqual(f, [
		".github/workflows/a.yml: no top-level permissions:",
		".github/workflows/a.yml: node-version 24.15.0 (j3); most common 22 x4 of 5 (22 x4, 24.15.0 x1)",
		".github/workflows/a.yml: runs-on ubuntu-latest (j3); most common ubuntu-26.04 x3 of 4 (ubuntu: ubuntu-26.04 x3, ubuntu-latest x1)",
	]);
});

test("measure reads workflows and composite actions from disk", async () => {
	const root = mkdtempSync(path.join(tmpdir(), "action-consistency-"));
	try {
		for (const [rel, body] of Object.entries({
			".github/workflows/a.yml": wf("a.yml", job("j", "ubuntu-26.04", `      - uses: o/r@${A} # v1\n`)).text,
			".github/actions/x/action.yml": `runs:\n  using: composite\n  steps:\n    - uses: o/r@${B} # v2\n`,
		})) {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), body);
		}
		const r = await measure({ root }, []);
		assert.equal(r.value, 1);
		assert.match(r.findings[0], /^o\/r: different SHAs/);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("this repository: stable", async () => {
	const first = await measure({ root: repoRoot });
	assert.deepEqual(await measure({ root: repoRoot }), first);
});

test("EXPECTED drops a deliberate deviation in its own file only and flags an entry that matches nothing", () => {
	const findings = [
		".github/workflows/a.yml: node-version 24.15.0 (j3); most common 22 x4 of 5 (22 x4, 24.15.0 x1)",
		".github/workflows/b.yml: node-version 24.15.0 (j1); most common 22 x4 of 5 (22 x4, 24.15.0 x1)",
	];
	const expected = [
		{ file: ".github/workflows/a.yml", kind: "node-version", value: "24.15.0", reason: "publish" },
		{ file: ".github/workflows/c.yml", kind: "runs-on", value: "windows-2022", reason: "old" },
	];
	assert.deepEqual(withoutExpected(findings, expected), [
		findings[1],
		".github/workflows/c.yml: EXPECTED runs-on windows-2022 no longer deviates; remove it",
	]);
});
