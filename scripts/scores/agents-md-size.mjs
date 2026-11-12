// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Lines in the largest AGENTS.md or CLAUDE.md. An agent loads the whole file whenever it works in that folder, whatever
// the task, so a long one spends context on rules the task does not need. Keep each one a short index that points to
// topic files (progressive disclosure). A ratchet: splitting the largest file moves the value down; raise the
// baseline then. Proposals (openspec/), other agents' working copies (.claude/worktrees/) and the CLI build's copies
// of runtime/ (cli/engine/, ...) are not this checkout's guidance and are left out.
import { read, walk } from "./lib.mjs";

export const meta = {
	id: "agents-md-size",
	title: "Lines in the largest AGENTS.md",
	source: "files",
	mode: "ratchet",
	better: "lower",
	unit: "lines",
};

export const isGuidance = (rel) =>
	/(^|\/)(AGENTS|CLAUDE)\.md$/.test(rel) &&
	!/^(openspec|\.claude\/worktrees|cli\/(discovery|engine|ext|specs))\//.test(rel);

export const lineCount = (text) => (text === "" ? 0 : text.replace(/\n$/, "").split("\n").length);

export function measure({ root }) {
	const sizes = walk(root, ".", isGuidance)
		.map((rel) => ({ rel, lines: lineCount(read(root, rel)) }))
		.sort((a, b) => b.lines - a.lines || a.rel.localeCompare(b.rel));
	const top = sizes[0];
	return {
		value: top ? top.lines : 0,
		summary: top ? `${sizes.length} guidance files; largest is ${top.rel} (${top.lines} lines)` : "no AGENTS.md",
		findings: sizes.slice(0, 5).map((s) => `${s.rel}: ${s.lines} lines`),
	};
}
