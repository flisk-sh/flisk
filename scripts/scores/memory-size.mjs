// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Size of .claude/memory/MEMORY.md, the list of verification and CI traps AGENTS.md asks agents to read before a PR.
// Past a few kilobytes no agent reads it whole, so a trap in it stops protecting anyone. Fix the file, not the
// number: turn a trap that keeps coming back into a gate here (and mark the line "Gate: <file>"), move area-specific
// lines next to the code they belong to, and delete lines a gate already enforces. A ratchet in kilobytes with a
// little tolerance, so adding one new trap does not fail a pull request; findings name the lines not yet gated.
import { read } from "./lib.mjs";

export const meta = {
	id: "memory-size",
	title: "Size of the repository memory file",
	source: "files",
	mode: "ratchet",
	better: "lower",
	unit: "KB",
	tolerance: 0.05,
};

export const FILE = ".claude/memory/MEMORY.md";

export function measure({ root }) {
	const text = read(root, FILE);
	const lines = text.split("\n").filter((l) => /^\s*[-*]\s+/.test(l));
	const gated = lines.filter((l) => /\bGate:/.test(l)).length;
	const kb = Math.round((Buffer.byteLength(text, "utf8") / 1024) * 10) / 10;
	return {
		value: kb,
		summary: `${FILE}: ${kb} KB, ${lines.length} entries, ${gated} turned into a gate`,
		findings: lines.length ? [`${lines.length - gated} of ${lines.length} entries have no "Gate:" yet`] : [],
	};
}
