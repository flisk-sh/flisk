// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The share of MCP tools in cli/src/mcp/tools.ts that some test names: a unit test under cli/src or anything under
// tests/ (the e2e suites drive the MCP server over stdio). An agent on MCP only reaches Flisk through these tools, and a
// tool no test calls can break its arguments or its CLI mapping with every suite still green. Tool names are read the
// way ade-score and mcp-parity read them. What counts as naming a tool:
//  - a quoted name ("up", 'up', `up`) or, for a snake_case name, the bare word (a shell suite's `resource_list`);
//  - a one-word name (up, status, logs) only in a test about MCP (its path says mcp, or it builds the tools or sends
//    tools/call), since "status" in a CLI test is the command, not the tool;
//  - not a line that holds nothing but the quoted name: that is an entry of the list that pins the tool inventory,
//    which proves the tool exists, not that it does what it says.
// Ratchet up.
import { mcpToolNames } from "../ade-score.mjs";
import { has, isTestFile, read, round1, walk } from "./lib.mjs";

export const meta = {
	id: "mcp-tool-tests",
	title: "MCP tools a test calls by name",
	source: "files",
	mode: "ratchet",
	better: "higher",
	unit: "%",
};

const TOOLS = "cli/src/mcp/tools.ts";

// Files under tests/ that are not test code.
const NOT_TESTS = /(^|\/)(package-lock\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml|uv\.lock)$|\.(svg|png|jpe?g|gif|webp|ico|pdf|tgz|gz|zip)$/i;

export function testFiles(root) {
	return [...walk(root, "cli/src", isTestFile), ...walk(root, "tests", (rel) => !NOT_TESTS.test(rel))];
}

const isMcpTest = (rel, text) => /mcp/i.test(rel) || /\bcreateFliskTools\b|tools\/call/.test(text);
const WORD = /[\w-]/;

// Whether a line names a tool. Plain string search with a boundary check, not a RegExp built from the name
// (tool-consistency does the same, for Semgrep's non-literal-regexp rule).
export function lineNames(line, name, { bare }) {
	const trimmed = line.trim().replace(/,$/, "");
	if (trimmed.length === name.length + 2 && /^["'`]$/.test(trimmed[0]) && trimmed.slice(1, -1) === name) return false;
	for (let at = line.indexOf(name); at !== -1; at = line.indexOf(name, at + 1)) {
		const before = line[at - 1] ?? " ";
		const after = line[at + name.length] ?? " ";
		if (/["'`]/.test(before) && after === before) return true;
		if (bare && !WORD.test(before) && !WORD.test(after)) return true;
	}
	return false;
}

// The tools one test file names, in the order of names.
export function namedIn(rel, text, names) {
	const lines = String(text).split("\n");
	const mcp = isMcpTest(rel, String(text));
	return names.filter((name) => {
		const snake = name.includes("_");
		if (!snake && !mcp) return false;
		return lines.some((line) => lineNames(line, name, { bare: snake }));
	});
}

export function measure({ root }) {
	if (!has(root, TOOLS)) throw new Error(`${TOOLS} is missing`);
	const names = mcpToolNames(root);
	if (!names.length) return { value: null };
	const tested = new Set();
	for (const rel of testFiles(root)) for (const name of namedIn(rel, read(root, rel), names)) tested.add(name);
	const lines = read(root, TOOLS).split("\n");
	const lineOf = (name) => lines.findIndex((l) => l.trim() === `name: "${name}",`) + 1;
	const missing = names.filter((n) => !tested.has(n));
	return {
		value: round1((tested.size / names.length) * 100),
		summary: `${tested.size} of ${names.length} MCP tools named by a test`,
		findings: missing.map((n) => `${TOOLS}:${lineOf(n)} ${n}: no test under cli/src or tests/ calls this tool`),
	};
}
