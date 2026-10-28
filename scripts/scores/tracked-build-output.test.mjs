// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the tracked-build-output scorer, on a real git repository so a tracked symlink counts.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { measure, outputRoot } from "./tracked-build-output.mjs";

test("outputRoot cuts a path at its first dependency or test-output segment", () => {
	assert.equal(outputRoot("cli/node_modules"), "cli/node_modules");
	assert.equal(outputRoot("cli/coverage/lcov.info"), "cli/coverage");
	assert.equal(outputRoot("cli/test-results/vitest.json"), "cli/test-results");
	assert.equal(outputRoot("docs/.DS_Store"), "docs/.DS_Store");
	assert.equal(outputRoot("cli/src/utils/coverage-report.ts"), null);
	assert.equal(outputRoot("scripts/scores/schema-coverage.mjs"), null);
});

test("measure reports a tracked node_modules symlink and coverage folder once each", () => {
	const root = mkdtempSync(path.join(tmpdir(), "tracked-build-output-"));
	try {
		const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
		git("init", "-q");
		mkdirSync(path.join(root, "cli/coverage"), { recursive: true });
		writeFileSync(path.join(root, "cli/coverage/a.json"), "{}");
		writeFileSync(path.join(root, "cli/coverage/b.json"), "{}");
		writeFileSync(path.join(root, "README.md"), "# x\n");
		symlinkSync("../node_modules", path.join(root, "cli/node_modules"));
		git("add", "-f", ".");
		const r = measure({ root });
		assert.deepEqual(r.findings, [
			"cli/coverage: tracked build output; git rm -r --cached it and keep it ignored",
			"cli/node_modules: tracked build output; git rm -r --cached it and keep it ignored",
		]);
		assert.equal(r.summary, "4 tracked paths, 2 dependency or test-output paths among them");
	} finally {
		rmSync(root, { recursive: true });
	}
});
