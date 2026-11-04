// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The share of leaf CLI commands that accept --json. An agent parses a JSON envelope; without one it scrapes coloured
// text that changes with every wording fix. Human-only commands (mcp-parity's list) are left out, and so are commands
// whose job is to hand the terminal to a person, where there is nothing to report.
import { commandTree, round1 } from "./lib.mjs";
import { isHumanOnly } from "./mcp-parity.mjs";

export const meta = {
	id: "json-coverage",
	title: "Leaf commands with --json",
	source: "files",
	mode: "ratchet",
	better: "higher",
	unit: "%",
};

// Commands that open an editor or a TUI, with the reason.
export const INTERACTIVE = {
	"config edit": "opens .flisk/project.json in $EDITOR",
};

export async function measure({ root }) {
	const tree = await commandTree(root);
	if (!tree) throw new Error("cli/dist/program.js is missing or does not load: run `bun install` in cli/");
	const leaves = tree.commands.filter((c) => c.leaf && !isHumanOnly(c.path) && !Object.hasOwn(INTERACTIVE, c.path));
	if (!leaves.length) return { value: null };
	const without = leaves.filter((c) => !c.options.includes("--json")).map((c) => c.path);
	const covered = leaves.length - without.length;
	return {
		value: round1((covered / leaves.length) * 100),
		summary: `${covered} of ${leaves.length} leaf commands accept --json`,
		findings: without.map((p) => `flisk ${p} has no --json`),
	};
}
