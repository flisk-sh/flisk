// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// OpenSpec changes whose tasks are all checked but that still sit in openspec/changes/ instead of archive/. Until a
// change is archived its spec deltas never reach openspec/specs/, so an agent reading the living specs sees the product
// as it was before the change shipped, and cannot tell live intent from history. A ratchet: archive one (`openspec
// archive <change>`) and raise the baseline. A change with no tasks.md, or no tasks in it, is not counted.
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { has, read } from "./lib.mjs";

export const meta = {
	id: "openspec-unarchived",
	title: "Finished OpenSpec changes not archived",
	source: "files",
	mode: "ratchet",
	better: "lower",
	unit: "changes",
};

// { done, total } task checkboxes in a tasks.md.
export function taskCounts(markdown) {
	const boxes = [...markdown.matchAll(/^\s*[-*]\s+\[([ xX])\]/gm)];
	return { done: boxes.filter((m) => m[1] !== " ").length, total: boxes.length };
}

export function measure({ root }) {
	const dir = "openspec/changes";
	if (!has(root, dir)) return { value: 0, summary: "no openspec/changes", findings: [] };
	const changes = readdirSync(path.join(root, dir))
		.filter((n) => n !== "archive" && statSync(path.join(root, dir, n)).isDirectory())
		.sort();
	const findings = [];
	for (const name of changes) {
		const { done, total } = taskCounts(read(root, `${dir}/${name}/tasks.md`));
		if (total > 0 && done === total) findings.push(`${dir}/${name}/tasks.md: ${total}/${total} tasks done, not archived`);
	}
	return {
		value: findings.length,
		summary: `${findings.length} of ${changes.length} open changes have every task done`,
		findings,
	};
}
