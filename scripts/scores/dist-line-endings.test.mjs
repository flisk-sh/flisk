// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the dist-line-endings scorer, on a real git repository: build folders are only read through git.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { firstCrlf, measure } from "./dist-line-endings.mjs";

test("firstCrlf gives the line of the first CRLF, or 0", () => {
	assert.equal(firstCrlf("a\nb\r\nc\r\n"), 2);
	assert.equal(firstCrlf("a\nb\n"), 0);
	assert.equal(firstCrlf("a\rb\n"), 0);
});

test("measure reads build files only and skips binaries", () => {
	const root = mkdtempSync(path.join(tmpdir(), "dist-line-endings-"));
	try {
		for (const [rel, body] of Object.entries({
			"cli/dist/program.js": "export const a = `x\r\ny`;\n",
			"cli/dist/ok.js": "export const b = 1;\n",
			"cli/dist-bundle/flisk.mjs": "a\r\n",
			"cli/dist/icon.png": "\r\n",
			"cli/src/program.ts": "a\r\n",
		})) {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), body);
		}
		execFileSync("git", ["init", "-q"], { cwd: root });
		execFileSync("git", ["add", "-f", "."], { cwd: root });
		const r = measure({ root });
		assert.deepEqual(r.findings, [
			"cli/dist-bundle/flisk.mjs:1 CRLF line ending; normalize the build to LF before staging",
			"cli/dist/program.js:1 CRLF line ending; normalize the build to LF before staging",
		]);
		assert.equal(r.summary, "3 committed build files, 2 with CRLF");
	} finally {
		rmSync(root, { recursive: true });
	}
});
