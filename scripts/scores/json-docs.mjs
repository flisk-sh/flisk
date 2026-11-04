// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The share of CLI commands with --json that docs/reference/machine-readable-cli.md documents. That page is the
// contract an agent or a script codes against (the envelope, the exit codes, what each command reports); a command
// that prints JSON nobody wrote down has a shape callers guess at, and a change to it breaks them without a doc diff
// to review. The commands are json-coverage's: leaf commands of the real command tree in cli/dist, without the
// human-only (mcp-parity) and interactive (json-coverage) ones, that accept --json. A command counts as documented
// when `flisk <its path>` appears in the page, anywhere (prose, tables or code), as a whole command (`flisk up` in
// `flisk upgrade` does not count), or when a list item starts with the path in backticks, the page's own convention
// for a command's fields: "- `config regenerate`: ...", "- `config enable-infra` and `config disable-infra`: ...". An
// alias does not count: readers look a command up by its name. Ratchet up.
import { INTERACTIVE } from "./json-coverage.mjs";
import { commandTree, has, read, round1 } from "./lib.mjs";
import { isHumanOnly } from "./mcp-parity.mjs";

export const meta = {
	id: "json-docs",
	title: "Commands with --json documented in machine-readable-cli.md",
	source: "files",
	mode: "ratchet",
	better: "higher",
	unit: "%",
};

export const DOC = "docs/reference/machine-readable-cli.md";

// The command paths json-coverage counts that accept --json, in tree order.
export function jsonCommands(tree) {
	return tree.commands
		.filter((c) => c.leaf && !isHumanOnly(c.path) && !Object.hasOwn(INTERACTIVE, c.path))
		.filter((c) => c.options.includes("--json"))
		.map((c) => c.path);
}

// Whether the text names `flisk <commandPath>` as a whole command, with any run of spaces between the words.
// Plain string search with a boundary check, not a RegExp built from the path (Semgrep's non-literal-regexp rule).
export function documents(text, commandPath) {
	const flat = String(text).replace(/[ \t]+/g, " ");
	const needle = `flisk ${commandPath}`;
	for (let at = flat.indexOf(needle); at !== -1; at = flat.indexOf(needle, at + 1)) {
		if (/[\w-]/.test(flat[at - 1] ?? " ")) continue;
		if (!/[\w-]/.test(flat[at + needle.length] ?? " ")) return true;
	}
	// A field list item: "- `<path>`: ..." or "- `<path>` and `<other>`: ...", the path alone or before its flags.
	return flat.split("\n").some((line) => {
		const item = /^\s*[-*] (.+?):/.exec(line)?.[1];
		if (!item) return false;
		return [...item.matchAll(/`([^`]+)`/g)].some((m) => m[1] === commandPath || m[1].startsWith(`${commandPath} --`));
	});
}

export async function measure({ root }) {
	const tree = await commandTree(root);
	if (!tree) throw new Error("cli/dist/program.js is missing or does not load: run `bun install` in cli/");
	if (!has(root, DOC)) throw new Error(`${DOC} is missing`);
	const commands = jsonCommands(tree);
	if (!commands.length) return { value: null };
	const doc = read(root, DOC);
	const missing = commands.filter((p) => !documents(doc, p));
	const covered = commands.length - missing.length;
	return {
		value: round1((covered / commands.length) * 100),
		summary: `${covered} of ${commands.length} commands with --json are in ${DOC}`,
		findings: missing.map((p) => `${DOC} flisk ${p} --json: not documented`),
	};
}
