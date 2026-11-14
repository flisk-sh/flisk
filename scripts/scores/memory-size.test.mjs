// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { FILE, measure } from "./memory-size.mjs";

test("measure reports kilobytes and how many entries became gates", () => {
	const root = mkdtempSync(path.join(tmpdir(), "memory-size-"));
	try {
		mkdirSync(path.join(root, ".claude/memory"), { recursive: true });
		writeFileSync(path.join(root, FILE), `# Memory\n- trap one\n- trap two. Gate: x.mjs\n${"x".repeat(2200)}\n`);
		const r = measure({ root });
		assert.equal(r.value, 2.2);
		assert.deepEqual(r.findings, ['1 of 2 entries have no "Gate:" yet']);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("measure is zero without the file", () => {
	const root = mkdtempSync(path.join(tmpdir(), "memory-size-"));
	try {
		assert.equal(measure({ root }).value, 0);
		assert.deepEqual(measure({ root }).findings, []);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
