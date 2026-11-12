// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { lineCount, measure } from "./agents-md-size.mjs";

test("lineCount ignores one trailing newline", () => {
	assert.equal(lineCount(""), 0);
	assert.equal(lineCount("a\nb\n"), 2);
	assert.equal(lineCount("a\nb"), 2);
});

test("measure reports the largest guidance file and skips proposals and build copies", () => {
	const root = mkdtempSync(path.join(tmpdir(), "agents-md-size-"));
	try {
		for (const d of ["cli", "cli/engine", "openspec/x"]) mkdirSync(path.join(root, d), { recursive: true });
		writeFileSync(path.join(root, "AGENTS.md"), "a\nb\n");
		writeFileSync(path.join(root, "cli/AGENTS.md"), "a\nb\nc\n");
		writeFileSync(path.join(root, "cli/engine/AGENTS.md"), "x\n".repeat(50));
		writeFileSync(path.join(root, "openspec/x/AGENTS.md"), "x\n".repeat(50));
		const r = measure({ root });
		assert.equal(r.value, 3);
		assert.deepEqual(r.findings, ["cli/AGENTS.md: 3 lines", "AGENTS.md: 2 lines"]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
