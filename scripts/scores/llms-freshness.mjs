// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Whether the agent contracts still name the current CLI surface. An agent that reads docs/agents/llms.txt or
// llms-full.txt learns the commands and MCP tools listed there and no others, so a command or tool added without a line
// in them stays invisible to it. Items: every top-level CLI command that is not human-only (mcp-parity's list), and
// every MCP tool in cli/src/mcp/tools.ts. A command is named when the text has `flisk <command>` (or one of its
// aliases) as whole words, in prose or code; a tool is named when it appears in backticks, as ade-score's
// mcp-tools-documented check reads it. The score is the share of (document, item) pairs that are named.
import { mcpToolNames } from "../ade-score.mjs";
import { commandTree, has, read, round1, walk } from "./lib.mjs";
import { isHumanOnly } from "./mcp-parity.mjs";

export const meta = {
	id: "llms-freshness",
	title: "Agent contracts that name every command and MCP tool",
	source: "files",
	mode: "ratchet",
	better: "higher",
	unit: "%",
};

export const CONTRACTS = ["docs/agents/llms.txt", "docs/agents/llms-full.txt"];

// The documents to check: the two contracts, and an AGENTS.md template under cli/templates (AGENTS.md, AGENTS.md.hbs)
// when there is one. Today there is none: a generated project's AGENTS.md comes from the Starlark generator
// runtime/engine/topologies/tilt/generators/agents_md.star, which is code, not a document to search.
export function documents(root) {
	return [...CONTRACTS, ...walk(root, "cli/templates", (rel) => /(^|\/)AGENTS\.md(\.\w+)?$/.test(rel))];
}

// Whether text names one of the command's names as `flisk <name>`: a standalone flisk (not @flisk-sh/flisk or
// flisk.sh), then the name as a whole word (`flisk resource` does not name resources).
// A scan, not a RegExp built from the name, so a command name is never compiled as a pattern.
export function namesCommand(text, names) {
	for (let at = text.indexOf("flisk"); at >= 0; at = text.indexOf("flisk", at + 1)) {
		if (/[\w./@-]/.test(text[at - 1] ?? "")) continue;
		let j = at + "flisk".length;
		const gap = j;
		while (/\s/.test(text[j] ?? "")) j++;
		if (j === gap) continue;
		if (names.some((n) => text.startsWith(n, j) && !/[\w-]/.test(text[j + n.length] ?? ""))) return true;
	}
	return false;
}

export const namesTool = (text, tool) => text.includes(`\`${tool}\``);

export async function measure({ root }) {
	const tree = await commandTree(root);
	if (!tree) throw new Error("cli/dist/program.js is missing or does not load: run `bun install` in cli/");
	const items = [
		...tree.commands
			.filter((c) => !c.path.includes(" ") && !isHumanOnly(c.path))
			.map((c) => ({ label: `flisk ${c.path}`, named: (text) => namesCommand(text, [c.path, ...c.aliases]) })),
		...mcpToolNames(root).map((t) => ({ label: `\`${t}\``, named: (text) => namesTool(text, t) })),
	];
	if (!items.length) return { value: null, summary: "no commands or MCP tools found", findings: [] };
	const docs = documents(root);
	const findings = [];
	const counts = [];
	let named = 0;
	for (const rel of docs) {
		// A missing contract names nothing: one finding for it, not one per item.
		if (!has(root, rel)) {
			findings.push(`${rel}: missing, so it names none of the ${items.length} commands and tools`);
			counts.push(`${rel.split("/").at(-1)} missing`);
			continue;
		}
		const text = read(root, rel);
		const missing = items.filter((item) => !item.named(text));
		for (const item of missing) findings.push(`${rel}: no ${item.label}`);
		named += items.length - missing.length;
		counts.push(`${rel.split("/").at(-1)} ${items.length - missing.length}/${items.length}`);
	}
	const pairs = items.length * docs.length;
	return {
		value: round1((named / pairs) * 100),
		summary: `${named} of ${pairs} (document, item) pairs named: ${counts.join(", ")}`,
		findings,
	};
}
