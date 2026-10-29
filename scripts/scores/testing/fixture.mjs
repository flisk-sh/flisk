// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Test helper: run `fn(root)` against a temporary repository built from { "rel/path": "text" }, then delete it.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export async function withFixture(files, fn) {
	const root = mkdtempSync(path.join(tmpdir(), "scores-"));
	try {
		for (const [rel, body] of Object.entries(files)) {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), body);
		}
		return await fn(root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}
