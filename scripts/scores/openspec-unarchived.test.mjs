// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { measure, taskCounts } from "./openspec-unarchived.mjs";

test("taskCounts counts checked and open checkboxes", () => {
	assert.deepEqual(taskCounts("- [x] a\n- [ ] b\n  * [X] c\nnot - [x] inline"), { done: 2, total: 3 });
});

test("measure counts finished changes outside archive/ only", () => {
	const root = mkdtempSync(path.join(tmpdir(), "openspec-unarchived-"));
	try {
		const add = (name, tasks) => {
			mkdirSync(path.join(root, "openspec/changes", name), { recursive: true });
			if (tasks !== null) writeFileSync(path.join(root, "openspec/changes", name, "tasks.md"), tasks);
		};
		add("done", "- [x] one\n- [x] two\n");
		add("open", "- [x] one\n- [ ] two\n");
		add("no-tasks", null);
		add("archive", "- [x] ignored\n");
		const { value, findings } = measure({ root });
		assert.equal(value, 1);
		assert.deepEqual(findings, ["openspec/changes/done/tasks.md: 2/2 tasks done, not archived"]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("measure is zero without openspec/", () => {
	const root = mkdtempSync(path.join(tmpdir(), "openspec-unarchived-"));
	try {
		assert.equal(measure({ root }).value, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
