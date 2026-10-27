// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The share of top-level CLI commands an agent can also reach through an MCP tool in cli/src/mcp/tools.ts. A command
// counts as covered when a tool has its name, or when a tool handler builds CLI arguments that start with it (the
// first string of an array literal it returns or assigns: `viaCli(() => ["status", "--json"])`, `return ["resources"]`,
// `const out = ["logs", "--json"]`). An agent on MCP alone cannot do what no tool reaches, so this ratchets up.
import { mcpToolNames } from "../ade-score.mjs";
import { commandTree, has, read, round1 } from "./lib.mjs";

export const meta = {
	id: "mcp-parity",
	title: "CLI commands reachable through an MCP tool",
	source: "files",
	mode: "ratchet",
	better: "higher",
	unit: "%",
};

// Commands a person runs and an agent has no use for, with the reason. json-coverage leaves them out too.
export const HUMAN_ONLY = {
	help: "prints usage for a person; agents read --help or the docs",
	completion: "installs shell completion for a person's terminal",
	ui: "an interactive terminal UI",
	mcp: "is the MCP server itself",
	connect: "writes the MCP entry into the agent's own config; an agent on MCP is already connected",
	version: "prints the CLI version, which doctor --json already reports",
	maintainers: "checks this repo's MAINTAINERS.md, not a user's project",
	open: "opens a browser for a person to look at",
	upgrade: "replaces the installed CLI, a person's call",
};

// Whether a command path ("maintainers check") belongs to a human-only command.
export const isHumanOnly = (commandPath) => Object.hasOwn(HUMAN_ONLY, commandPath.split(" ")[0]);

// The first word of the CLI arguments the tool handlers build: the first string of an array literal that is returned
// (`return [`, an arrow body `=> [`, the branch of a ternary `? [`) or assigned (`= [`). A property such as
// `required: ["resource"]` is a schema, not CLI arguments, so `: [` does not count.
export function cliArgCommands(source) {
	return [...String(source).matchAll(/(?:\breturn|=>|[=?])\s*\[\s*"([a-z][\w-]*)"/g)].map((m) => m[1]);
}

export async function measure({ root }) {
	const tree = await commandTree(root);
	const tools = "cli/src/mcp/tools.ts";
	if (!tree) throw new Error("cli/dist/program.js is missing or does not load: run `bun install` in cli/");
	if (!has(root, tools)) throw new Error(`${tools} is missing`);
	const reached = new Set([...mcpToolNames(root), ...cliArgCommands(read(root, tools))]);
	const top = tree.commands.filter((c) => !c.path.includes(" ") && !isHumanOnly(c.path));
	if (!top.length) return { value: null };
	const covered = top.filter((c) => [c.path, ...c.aliases].some((name) => reached.has(name)));
	const missing = top.filter((c) => !covered.includes(c)).map((c) => c.path);
	return {
		value: round1((covered.length / top.length) * 100),
		summary: `${covered.length} of ${top.length} commands reachable through MCP`,
		findings: missing.map((name) => `flisk ${name} has no MCP tool`),
	};
}
