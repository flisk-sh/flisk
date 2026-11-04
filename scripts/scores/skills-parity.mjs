// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The share of agent skills whose documented `flisk ...` commands all resolve in the real CLI. A skill is a folder with
// a SKILL.md under .claude/skills/ or cli/templates/agent-skills/. All of .claude/skills counts, the synced skills too:
// they are what `npx skills add flisk-sh/flisk-skills` installs, so their drift is what agents copy, even though the
// fix lands in flisk-skills. cli/templates/agent-skills is written into every generated project. Commands are read and
// checked with command-drift's snippets, invocations and problems (aliases, flags, the one-command templates); its
// INTENTIONAL list does not apply, since a skill is steps to follow, not prose about a command that does not exist.
// A clean skill only proves that its commands and flags exist in the CLI, not that they succeed: nothing is run.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { invocations, problems, snippets } from "./command-drift.mjs";
import { commandTree, read, round1, walk } from "./lib.mjs";

export const meta = {
	id: "skills-parity",
	title: "Agent skills whose flisk commands all exist",
	source: "files",
	mode: "ratchet",
	better: "higher",
	unit: "%",
};

// Where skills live: the repo's own (local and synced) and the ones every generated project gets.
export const SKILL_ROOTS = [".claude/skills", "cli/templates/agent-skills"];

// Every skill: { name, docs }, one per folder directly under a skill root that has a SKILL.md. docs are all its
// markdown files (SKILL.md and any references next to it), so a command in a reference file counts too.
export function skills(root) {
	return SKILL_ROOTS.flatMap((base) =>
		walk(root, base, (rel) => /^[^/]+\/SKILL\.md$/.test(rel.slice(base.length + 1))).map((file) => {
			const dir = path.posix.dirname(file);
			return { name: path.posix.basename(dir), docs: walk(root, dir, (rel) => rel.endsWith(".md")) };
		}),
	);
}

// The template names of the one-command flow (`flisk demo`), from the same committed build as the command tree, as
// command-drift reads them.
async function templateNames(root) {
	try {
		const file = path.join(root, "cli/dist/utils/project-templates.js");
		return new Set(Object.keys((await import(pathToFileURL(file).href)).PROJECT_TEMPLATES ?? {}));
	} catch {
		return new Set();
	}
}

export async function measure({ root }) {
	const tree = await commandTree(root);
	if (!tree) throw new Error("cli/dist/program.js is missing or does not load: run `bun install` in cli/");
	const templates = await templateNames(root);
	const all = skills(root);
	if (!all.length) return { value: null, summary: "no skills found", findings: [] };
	const findings = [];
	let checked = 0;
	let clean = 0;
	let silent = 0;
	for (const skill of all) {
		const before = findings.length;
		let commands = 0;
		for (const rel of skill.docs) {
			for (const { line, text, next } of snippets(read(root, rel))) {
				// A transcript that shows the CLI rejecting a command documents the error, not a command to copy.
				if (/^\s*error: unknown (command|option)/.test(next)) continue;
				for (const args of invocations(text)) {
					commands++;
					const command = ["flisk", ...args].join(" ");
					for (const problem of problems(tree, args, templates))
						findings.push(`${skill.name} (${rel}:${line}): ${command}: ${problem}`);
				}
			}
		}
		checked += commands;
		// A skill that names no flisk command has nothing to drift, so it counts as clean.
		if (findings.length === before) clean++;
		if (!commands) silent++;
	}
	const none = silent ? ` (${silent} name no flisk command)` : "";
	return {
		value: round1((clean / all.length) * 100),
		summary: `${clean} of ${all.length} skills clean${none}, ${checked} flisk commands checked`,
		findings,
	};
}
