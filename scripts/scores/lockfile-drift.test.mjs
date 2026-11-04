// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the lockfile-drift scorer.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { drift, locked, measure } from "./lockfile-drift.mjs";

const PKG = { dependencies: { commander: "^14.0.0", yaml: "^2.8.0" }, devDependencies: { vitest: "4.1.0" } };
const LOCK = {
	lockfileVersion: "9.0",
	importers: {
		".": {
			dependencies: {
				commander: { specifier: "^14.0.0", version: "14.0.1" },
				yaml: { specifier: "^2.7.0", version: "2.7.1" },
			},
			devDependencies: {
				vitest: { specifier: "4.1.0", version: "4.1.0" },
				rimraf: { specifier: "^6.0.0", version: "6.0.1" },
			},
		},
	},
};

test("locked reads specifiers from the root importer and from the older top-level layout", () => {
	assert.equal(locked(LOCK).get("yaml"), "^2.7.0");
	assert.equal(locked({ specifiers: { a: "^1.0.0" }, dependencies: { a: "1.0.3" } }).get("a"), "^1.0.0");
});

test("drift reports changed ranges, unlocked dependencies and stale locked ones", () => {
	const pkg = { ...PKG, dependencies: { ...PKG.dependencies, chalk: "^5.0.0" } };
	assert.deepEqual(drift(pkg, LOCK), [
		"yaml is ^2.8.0 in package.json but ^2.7.0 in the lockfile",
		"chalk@^5.0.0 is in package.json but not in the lockfile",
		"rimraf is locked but no longer in package.json",
	]);
	const synced = structuredClone(LOCK);
	synced.importers["."].dependencies.yaml.specifier = "^2.8.0";
	delete synced.importers["."].devDependencies.rimraf;
	assert.deepEqual(drift(PKG, synced), []);
});

test("measure compares cli/package.json with cli/pnpm-lock.yaml and skips a repo without one", () => {
	const root = mkdtempSync(path.join(tmpdir(), "lockfile-drift-"));
	try {
		mkdirSync(path.join(root, "cli"));
		writeFileSync(path.join(root, "cli/package.json"), JSON.stringify(PKG));
		assert.equal(measure({ root }).value, null);
		writeFileSync(
			path.join(root, "cli/pnpm-lock.yaml"),
			"lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      commander:\n        specifier: ^14.0.0\n        version: 14.0.1\n      yaml:\n        specifier: ^2.8.0\n        version: 2.8.0\n",
		);
		const r = measure({ root });
		assert.equal(r.value, 1);
		assert.equal(
			r.findings[0],
			"cli/pnpm-lock.yaml: vitest@4.1.0 is in package.json but not in the lockfile (run pnpm install --lockfile-only in cli/)",
		);
		writeFileSync(path.join(root, "cli/pnpm-lock.yaml"), "importers: [\n");
		assert.equal(measure({ root }).value, 1);
	} finally {
		rmSync(root, { recursive: true });
	}
});
