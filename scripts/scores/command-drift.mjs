// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Every `flisk ...` command in the docs that agents and people copy must exist in the CLI. Commands come from fenced
// code blocks and inline code spans; each one is resolved against the real Commander tree in cli/dist (aliases count)
// and every --flag is checked against that command's options plus the root options. A documented command the CLI
// rejects costs an agent a failed call and a guess, so this is a gate at zero.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { codeBlocks, commandTree, has, localSkillDocs, read, walk } from "./lib.mjs";

export const meta = {
	id: "command-drift",
	title: "Documented flisk commands exist in the CLI",
	source: "files",
	mode: "gate",
	better: "lower",
	unit: "violations",
	target: 0,
};

// CHANGELOG.md and openspec/ record history and proposals, where a renamed or not-yet-built command is correct as
// written (openspec/ sits outside the scanned folders anyway). docs/ROADMAP.md and the strategy memo's gap analysis
// list proposed commands that do not exist yet.
const SKIPPED = [/(^|\/)CHANGELOG\.md$/, /^docs\/ROADMAP\.md$/, /^docs\/strategy-memo-gap-analysis\.md$/];

// Prose that names a command which does not exist on purpose. Each entry needs its reason; an entry that no longer
// matches anything is itself a finding, so the list cannot go stale.
export const INTENTIONAL = [
	{ file: "docs/cheat-sheet.md", command: "flisk do", reason: "a partial command the reader completes with Tab" },
	{ file: "docs/contributing/finding-bugs.md", command: "flisk smoke", reason: "cites the old doc bug #723" },
	{
		file: "docs/contributing/translations/finding-bugs-ja.md",
		command: "flisk smoke",
		reason: "cites the old doc bug #723",
	},
	{ file: "docs/data.md", command: "flisk db reset", reason: "says the command does not exist" },
	{ file: "docs/data.md", command: "flisk db seed", reason: "says the command does not exist" },
];

// A word that stands for something the reader fills in: <name>, [stack], {id}, $VAR, ... or …
const PLACEHOLDER = /[<[{$]|\.\.\.|…/;

// Commands are lower-case words. `flisk 1.3.79 is older than ...` or `flisk X` is output or prose that names the CLI.
const COMMAND_WORD = /^[a-z][a-z0-9-]*$/;

// The docs to scan: the READMEs and AGENTS.md, everything under docs/, the agent contracts in docs/agents/*.txt, the
// skills this repo authors (synced ones are fixed in flisk-skills), and cli/templates/, which becomes the AGENTS.md and
// skills of every generated project.
export function docFiles(root) {
	const md = (rel) => rel.endsWith(".md");
	return [
		...["README.md", "AGENTS.md"].filter((rel) => has(root, rel)),
		...walk(root, "docs", md),
		...walk(root, "docs/agents", (rel) => /^docs\/agents\/[^/]+\.txt$/.test(rel)),
		...localSkillDocs(root),
		...walk(root, "cli/templates", md),
	].filter((rel) => !SKIPPED.some((re) => re.test(rel)));
}

// Shell-like text with its line number: every line of a fenced code block (with the line after it, to recognise
// printed output), and every inline code span outside them. A table cell escapes | as \|, inside code spans too.
export function snippets(markdown) {
	const lines = String(markdown).split("\n");
	const out = [];
	const fenced = new Set();
	for (const block of codeBlocks(markdown)) {
		const body = block.body.split("\n");
		for (let i = block.line - 1; i <= block.line + body.length; i++) fenced.add(i);
		body.forEach((text, i) => out.push({ line: block.line + i, text, next: body[i + 1] ?? "" }));
	}
	lines.forEach((text, i) => {
		if (fenced.has(i + 1)) return;
		for (const m of text.matchAll(/(`+)(.+?)\1(?!`)/g))
			out.push({ line: i + 1, text: m[2].replaceAll("\\|", "|"), next: "" });
	});
	return out.sort((a, b) => a.line - b.line);
}

// The argument lists of the flisk commands in one line of shell: the words after a standalone `flisk` (so `npx flisk`
// counts and `flisk-sh/flisk` or `flisk.sh` do not), up to a shell separator, a comment, a trailing backslash or the
// next `flisk` (`claude mcp add flisk -- flisk mcp`, or a prompt such as "run flisk status and flisk networks").
// Trailing punctuation is dropped, since prompts for an agent sit in code blocks as sentences.
export function invocations(text) {
	const commands = [[]];
	for (const raw of String(text).trim().split(/\s+/).filter(Boolean)) {
		if (raw.startsWith("#") || raw === "\\") break;
		const word = raw.replace(/\\$/, "");
		if (PLACEHOLDER.test(word)) commands.at(-1).push(word);
		else
			word.split(/(&&|\|\||[|;&>])/).forEach((part, i) => {
				if (i % 2) commands.push([]);
				else if (part) commands.at(-1).push(part);
			});
		if (word !== raw) break;
	}
	const out = [];
	for (const words of commands) {
		let current = null;
		for (const word of words) {
			const bare = PLACEHOLDER.test(word) ? word : word.replace(/[,.:)"'\]]+$/, "");
			if (word === "flisk") out.push((current = []));
			else if (current && bare) current.push(bare);
		}
	}
	return out;
}

// What is wrong with `flisk <args>` against the command tree, as a list of problems (empty when it would run).
// templates: the names `flisk <template>` accepts (flisk demo, flisk saas), the one-command flow cli.ts runs before
// Commander; it takes only the root options.
export function problems(tree, input, templates = new Set()) {
	const out = [];
	// cli.ts rewrites a leading --doctor to doctor before Commander parses.
	const args = input[0] === "--doctor" ? ["doctor", ...input.slice(1)] : input;
	const byPath = new Map();
	for (const cmd of tree.commands) {
		byPath.set(cmd.path, cmd);
		const parent = cmd.path.split(" ").slice(0, -1);
		for (const alias of cmd.aliases) byPath.set([...parent, alias].join(" "), cmd);
	}
	const firstWord = args.findIndex((a) => !a.startsWith("-"));
	const words = [];
	for (let i = firstWord; i >= 0 && i < args.length && !args[i].startsWith("-"); i++) words.push(args[i]);
	if (words.length && (PLACEHOLDER.test(words[0]) || !COMMAND_WORD.test(words[0]))) return [];
	let cmd = null;
	let depth = 0;
	for (let k = words.length; k > 0 && !cmd; k--) {
		if (words.slice(0, k).some((w) => PLACEHOLDER.test(w))) continue;
		cmd = byPath.get(words.slice(0, k).join(" ")) ?? null;
		depth = k;
	}
	if (!cmd && words.length && !templates.has(words[0])) out.push(`unknown command ${words[0]}`);
	else if (cmd && !cmd.leaf && words.length > depth && !PLACEHOLDER.test(words[depth]))
		out.push(`unknown command ${cmd.path} ${words[depth]}`);
	if (cmd?.allowUnknown) return out;
	// Before the command name only root options parse (`flisk --json status` is an error); after it, its own too.
	const rootOnly = new Set(tree.rootOptions);
	const withCommand = new Set([...tree.rootOptions, ...(cmd?.options ?? [])]);
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--") break;
		if (!args[i].startsWith("--")) continue;
		const name = args[i].split("=")[0];
		// Commander registers --no-x under its own long name, so it is matched as written.
		const allowed = i > firstWord ? withCommand : rootOnly;
		if (!PLACEHOLDER.test(name) && !allowed.has(name)) out.push(`unknown option ${name}`);
	}
	return out;
}

// The template names of the one-command flow, from the same committed build as the command tree.
async function templateNames(root) {
	try {
		const file = path.join(root, "cli/dist/utils/project-templates.js");
		return new Set(Object.keys((await import(pathToFileURL(file).href)).PROJECT_TEMPLATES ?? {}));
	} catch {
		return new Set();
	}
}

export async function measure({ root }, intentional = INTENTIONAL) {
	const tree = await commandTree(root);
	if (!tree) throw new Error("cli/dist/program.js is missing or does not load: run `bun install` in cli/");
	const templates = await templateNames(root);
	const findings = [];
	const used = new Set();
	let checked = 0;
	const files = docFiles(root);
	for (const rel of files) {
		for (const { line, text, next } of snippets(read(root, rel))) {
			// A transcript that shows the CLI rejecting a command documents the error, not a command to copy.
			if (/^\s*error: unknown (command|option)/.test(next)) continue;
			for (const args of invocations(text)) {
				checked++;
				const command = ["flisk", ...args].join(" ");
				const found = problems(tree, args, templates);
				const known = intentional.find((e) => e.file === rel && e.command === command);
				if (known && found.length) {
					used.add(known);
					continue;
				}
				for (const problem of found) findings.push(`${rel}:${line} ${command}: ${problem}`);
			}
		}
	}
	for (const e of intentional.filter((x) => !used.has(x)))
		findings.push(`${e.file} ${e.command}: INTENTIONAL entry no longer matches a rejected command; remove it`);
	return {
		value: findings.length,
		summary: `${checked} flisk commands in ${files.length} docs, ${findings.length} that the CLI would reject`,
		findings,
	};
}
