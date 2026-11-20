// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/check-star-shell-paths.mjs. Run by `make test-shell`.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkStarShellPaths, formatReport } from "./check-star-shell-paths.mjs";

function fixture(source) {
	const root = mkdtempSync(path.join(os.tmpdir(), "star-shell-"));
	mkdirSync(path.join(root, "runtime"));
	writeFileSync(path.join(root, "runtime", "watchers.star"), source, "utf8");
	return root;
}

test("a bare ./script.sh in a local_resource fails with no Windows branch", (t) => {
	const root = fixture("local_resource('prune',\n    cmd='./scripts/cleanup.sh --force',\n)\n");
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const result = checkStarShellPaths(root);
	assert.deepEqual(result.paths, ["./scripts/cleanup.sh"]);
	assert.equal(result.problems.length, 2);
	assert.match(result.problems[0], /no Windows branch/);
	assert.match(result.problems[1], /executed directly/);
	assert.match(formatReport(result), /FAIL:/);
});

test("bash plus a platform helper passes and still lists the script", (t) => {
	const root = fixture(
		"local_resource('prune',\n    cmd=maintenance_command('prune', 'bash ./scripts/cleanup.sh --force', 'reason', IS_NATIVE_WINDOWS),\n)\n",
	);
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const result = checkStarShellPaths(root);
	assert.deepEqual(result.paths, ["./scripts/cleanup.sh"]);
	assert.deepEqual(result.problems, []);
	assert.match(formatReport(result), /PASS:/);
});

test("a list command with a Windows PowerShell override stays allowed", (t) => {
	const root = fixture(
		"local_resource('publish',\n    cmd=['./scripts/build.sh', path],\n    cmd_bat=['powershell', '-File', './scripts/build.ps1', path],\n)\n",
	);
	t.after(() => rmSync(root, { recursive: true, force: true }));
	assert.deepEqual(checkStarShellPaths(root).problems, []);
});

test("a Windows override that invokes a .sh file directly fails", (t) => {
	const root = fixture(
		"local_resource('publish',\n    cmd=['./scripts/build.sh'],\n    cmd_bat=['cmd', '/c', './scripts/build.sh'],\n)\n",
	);
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const result = checkStarShellPaths(root);
	assert.equal(result.problems.length, 1);
	assert.match(result.problems[0], /Windows override executes .* directly/);
});

test("the repository's Starlark has no direct Windows shell execution", () => {
	const result = checkStarShellPaths();
	assert.ok(result.files > 20, `expected the runtime Starlark tree, got ${result.files} files`);
	assert.ok(
		result.paths.some((p) => p.endsWith("cleanup-tilt-images.sh")),
		`expected the maintenance scripts to be listed: ${result.paths.join(", ")}`,
	);
	assert.deepEqual(result.problems, []);
});
