// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The MCP tools in cli/src/mcp/tools.ts, the CLI they wrap and the prose that counts them should agree. Findings:
// tool names that break the dominant naming pattern, tools with a thin description, no inputSchema or no projectPath,
// a tool missing from a doc that lists the others, a number in prose ("nineteen tools", "20 skills") that is not the
// real count, and CLI commands or options with no description, a non-kebab-case flag or a copied description. An agent
// picks a tool by its name and description, so an outlier costs a wrong call; a stale count costs trust. Ratchet.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mcpToolNames } from "../ade-score.mjs";
import { codeBlocks, commandTree, has, localSkillDocs, read, walk } from "./lib.mjs";

export const meta = {
	id: "tool-consistency",
	title: "MCP tools, CLI and docs agree with each other",
	source: "files",
	mode: "ratchet",
	better: "lower",
	unit: "inconsistencies",
};

const TOOLS = "cli/src/mcp/tools.ts";

// The naming pattern. A tool is either one word (it mirrors a top-level CLI command: doctor, up, status) or
// <noun>_<verb> (config_verify, stack_list, network_list). VERBS is the vocabulary used to tell the two halves apart:
// a multi-word name whose FIRST word is a verb is verb-first (list_agents, restart_resource, get_agent_sessions). The
// rule only speaks when most multi-word tools are noun-first, so a repo that picked the other order is not flagged.
// Subtle cases (a noun that is also a verb: check, info) are not judged: only the first word is looked at.
export const VERBS = new Set([
	"add",
	"assign",
	"check",
	"create",
	"delete",
	"down",
	"get",
	"init",
	"list",
	"read",
	"regenerate",
	"remove",
	"restart",
	"run",
	"set",
	"show",
	"start",
	"stop",
	"update",
	"verify",
]);
const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const KEBAB_FLAG = /^--(no-)?[a-z0-9]+(-[a-z0-9]+)*$/;

// A tool description shorter than this says too little to pick the tool by (the shortest real one is `down`, 85).
const MIN_DESCRIPTION = 40;

// Files that list the tools are found by what they contain: a file naming at least this share of the tools lists them
// (AGENTS.md names 7 of 19 inline, which is a mention, not a list, so it is not held to the rest).
const LIST_SHARE = 0.6;

// Prose that states a count of something that was true once: a changelog, a roadmap, the gap analysis written
// against an older tool set ("two MCP tools"), and launch kits, whose copy and rendered images describe the published
// release they name (docs/launch/flisk-for-agents cites 1.4.8 and its 19 tools). openspec/ holds proposals and sits
// outside the scanned folders.
const SKIPPED = [
	/(^|\/)CHANGELOG\.md$/,
	/^docs\/ROADMAP\.md$/,
	/^docs\/strategy-memo-gap-analysis\.md$/,
	/^docs\/launch\//,
];

// Tools as { name, description, hasSchema, hasProjectPath }, read from the source text the way ade-score reads names:
// a tool starts at its `name: "x",` line and ends at the next one.
export function parseTools(source) {
	const starts = [...String(source).matchAll(/^\s+name: "([a-z_]+)",$/gm)];
	return starts.map((m, i) => {
		const block = String(source).slice(m.index, starts[i + 1]?.index ?? String(source).length);
		const literal = /\bdescription:\s*("(?:[^"\\]|\\.)*")/.exec(block)?.[1];
		let description = "";
		try {
			description = literal ? JSON.parse(literal) : "";
		} catch {
			description = literal?.slice(1, -1) ?? "";
		}
		return {
			name: m[1],
			description,
			hasSchema: /\binputSchema:/.test(block),
			hasProjectPath: /\bprojectPath\b/.test(block),
		};
	});
}

export function namingProblems(names) {
	const out = [];
	const multi = names.filter((n) => n.includes("_"));
	const verbFirst = multi.filter((n) => VERBS.has(n.split("_")[0]));
	const nounFirst = multi.length - verbFirst.length;
	for (const name of names)
		if (!SNAKE_CASE.test(name)) out.push(`${name}: tool names are snake_case (lower-case words joined by _)`);
	if (nounFirst > verbFirst.length)
		for (const name of verbFirst)
			out.push(
				`${name}: verb-first; ${nounFirst} of ${multi.length} multi-word tools are <noun>_<verb> (resource_list, stack_list, config_verify)`,
			);
	return out;
}

export function descriptionProblems(tools) {
	const out = [];
	const seen = new Map();
	const withPath = tools.filter((t) => t.hasProjectPath).length;
	for (const t of tools) {
		if (t.description.length < MIN_DESCRIPTION)
			out.push(`${t.name}: description is ${t.description.length} characters (at least ${MIN_DESCRIPTION})`);
		else if (!/[.!?]["')`]?$/.test(t.description.trim()))
			out.push(`${t.name}: description does not end as a sentence`);
		if (!t.hasSchema) out.push(`${t.name}: no inputSchema`);
		// Every tool runs in a project, so a tool without projectPath cannot be pointed at one.
		else if (withPath * 2 > tools.length && !t.hasProjectPath)
			out.push(`${t.name}: no projectPath input, which ${withPath} of ${tools.length} tools accept`);
		if (t.description && seen.has(t.description))
			out.push(`${t.name}: same description as ${seen.get(t.description)}`);
		else seen.set(t.description, t.name);
	}
	return out;
}

// Whether a doc names a tool. A snake_case name is distinctive; a one-word name (up, status, logs) must sit in
// backticks, or the sentence "the logs" would count.
// Plain string search with a word-boundary check, not a RegExp built from the name (Semgrep's non-literal-regexp rule).
const mentions = (text, name) => {
	if (!name.includes("_")) return text.includes(`\`${name}\``);
	const wordChar = /[\w-]/;
	for (let at = text.indexOf(name); at !== -1; at = text.indexOf(name, at + 1)) {
		if (!wordChar.test(text[at - 1] ?? " ") && !wordChar.test(text[at + name.length] ?? " ")) return true;
	}
	return false;
};

// Docs to scan for tool lists and for counts: the READMEs and AGENTS.md, docs/ (markdown and the agent contracts),
// the skills this repo authors (synced ones are fixed in flisk-skills) and cli/templates/.
export function proseFiles(root) {
	const md = (rel) => rel.endsWith(".md");
	return [
		...["README.md", "AGENTS.md"].filter((rel) => has(root, rel)),
		...walk(root, "docs", (rel) => md(rel) || /^docs\/agents\/[^/]+\.txt$/.test(rel)),
		...localSkillDocs(root),
		...walk(root, "cli/templates", md),
	].filter((rel) => !SKIPPED.some((re) => re.test(rel)));
}

export function docListProblems(root, names, files) {
	const out = [];
	const lists = [];
	for (const rel of files) {
		const text = read(root, rel);
		const missing = names.filter((n) => !mentions(text, n));
		if (names.length - missing.length >= names.length * LIST_SHARE) {
			lists.push(rel);
			for (const n of missing) out.push(`${rel}: lists ${names.length - missing.length} of ${names.length} tools but not ${n}`);
		}
	}
	return { findings: out, lists };
}

const WORDS = {
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	eleven: 11,
	twelve: 12,
	thirteen: 13,
	fourteen: 14,
	fifteen: 15,
	sixteen: 16,
	seventeen: 17,
	eighteen: 18,
	nineteen: 19,
	twenty: 20,
	thirty: 30,
	forty: 40,
	fifty: 50,
};

export function numberOf(text) {
	const t = text.toLowerCase();
	if (/^\d+$/.test(t)) return Number(t);
	const [tens, ones] = t.split("-");
	if (WORDS[tens] !== undefined && ones === undefined) return WORDS[tens];
	if (WORDS[tens] >= 20 && WORDS[ones] < 10) return WORDS[tens] + WORDS[ones];
	return null;
}

// Counts the docs state as `<number> <qualifier>? <noun>`: noun -> the pattern, the values that are right (a noun with
// two honest answers lists both), and when a line counts. The qualifier is deliberately narrow: "three commands" in a
// quickstart, "two tools each" in a comparison table and "4 skills" in an unrelated sentence are not these counts.
//  - "N new tools" is a delta (a changelog line, a PR summary), not a total, so a `new` qualifier is never matched.
//  - tools: only where the line or the file is about MCP, since "tools" alone also means Docker, Tilt or competitors.
//  - commands: only "CLI commands" and "top-level commands"; the bare "commands" of the quickstarts is a tutorial subset.
export function countTable({ tools, commands, skills, scorers, translations, resourceTypes }) {
	const mcpLine = (line, rel) => /\bMCP\b|exposes/i.test(line) || /(^|\/)(agent-tooling|mcp)[./]/.test(rel);
	return [
		{ noun: "tools", after: /^((?:MCP |Flisk |Flisk MCP )?tools)\b/i, good: [tools], when: mcpLine },
		{ noun: "commands", after: /^((?:CLI|top-level|CLI top-level) commands)\b/i, good: commands },
		{ noun: "skills", after: /^((?:agent |Flisk |Flisk agent )?skills)\b/i, good: skills },
		{ noun: "scorers", after: /^(scorers)\b/i, good: [scorers] },
		{ noun: "translations", after: /^((?:README )?translations)\b/i, good: translations },
		{ noun: "languages", after: /^(languages)\b/i, good: translations, when: (line) => /README|translat/i.test(line) },
		{ noun: "resource types", after: /^(resource types)\b/i, good: resourceTypes },
	];
}

// A count word or number followed by a space or hyphen; the noun after it is matched by each row's `after` literal.
const NUMBER_AT = /(?<![\w.])(\d+|(?:twenty|thirty|forty|fifty)(?:-(?:one|two|three|four|five|six|seven|eight|nine))?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)(?:\s|-)/gi;
// "up to 3 skills", "at least 5", "more than 10", "the first 3", "per 2 commands" state a bound or a part, not a total.
const BOUND = /(?:\bup to|\bat least|\bat most|\bmore than|\bfewer than|\bless than|\bfirst|\blast|\btop|\bper|\bonly|[~>≥≤+-])\s*$/i;

export function countFindings(root, files, table) {
	const out = [];
	for (const rel of files) {
		const text = read(root, rel);
		const fenced = new Set();
		for (const block of codeBlocks(text))
			for (let i = block.line - 1; i < block.line + block.body.split("\n").length + 1; i++) fenced.add(i);
		text.split("\n").forEach((line, i) => {
			if (fenced.has(i + 1)) return;
			for (const row of table) {
				if (row.when && !row.when(line, rel)) continue;
				for (const m of line.matchAll(NUMBER_AT)) {
					const noun = row.after.exec(line.slice(m.index + m[0].length));
					if (!noun) continue;
					if (BOUND.test(line.slice(0, m.index))) continue;
					const n = numberOf(m[1]);
					if (n !== null && !row.good.includes(n))
						out.push(`${rel}:${i + 1}: says "${m[1]} ${noun[1]}"; the repo has ${[...new Set(row.good)].join(" or ")}`);
				}
			}
		});
	}
	return out;
}

// The command tree with descriptions and options, read from the committed cli/dist build like lib.commandTree.
async function loadProgram(root) {
	const file = path.join(root, "cli/dist/program.js");
	try {
		return (await import(pathToFileURL(file).href)).createProgram();
	} catch {
		return null;
	}
}

export function cliProblems(program) {
	const out = [];
	const seen = new Map();
	const visit = (cmd, prefix) => {
		const label = prefix.length ? `flisk ${prefix.join(" ")}` : "flisk";
		for (const o of cmd.options) {
			if (!o.long) continue;
			if (!KEBAB_FLAG.test(o.long)) out.push(`${label} ${o.long}: option names are kebab-case`);
			if (!o.description) out.push(`${label} ${o.long}: option has no description`);
		}
		for (const sub of cmd.commands) {
			const p = [...prefix, sub.name()];
			const desc = sub.description().trim();
			if (!desc) out.push(`flisk ${p.join(" ")}: command has no description`);
			else if (seen.has(desc)) out.push(`flisk ${p.join(" ")}: same description as flisk ${seen.get(desc)}`);
			else seen.set(desc, p.join(" "));
			visit(sub, p);
		}
	};
	visit(program, []);
	return out;
}

// Values a count of the repo's things may honestly have.
function counts(root, tools, tree) {
	const skillDirs = walk(root, ".claude/skills", (rel) => rel.endsWith("/SKILL.md")).length;
	const localSkills = read(root, ".claude/skills/LOCAL")
		.split("\n")
		.filter((l) => l.trim() && !l.trim().startsWith("#")).length;
	const shipped = walk(root, "cli/templates/agent-skills", (rel) => rel.endsWith("/SKILL.md")).length;
	const top = tree.commands.filter((c) => !c.path.includes(" ")).length;
	const all = tree.commands.length;
	const readmes = walk(root, "docs", (rel) => /^docs\/README-[\w-]+\.md$/.test(rel)).length;
	const scorers = walk(root, "scripts/scores", (rel) => /^scripts\/scores\/[^/]+\.mjs$/.test(rel) && !/\.test\.mjs$|\/(run|lib)\.mjs$/.test(rel)).length;
	const types = read(root, "cli/src/types/index.ts");
	const union = /export type ResourceType =([^;]*);/.exec(types)?.[1].match(/"[^"]+"/g)?.length ?? 0;
	const creatable = /CREATABLE_RESOURCE_TYPES = \[([^\]]*)\]/.exec(types)?.[1].match(/"[^"]+"/g)?.length ?? 0;
	return {
		tools: tools.length,
		// With and without Commander's built-in help, which lib.commandTree adds as a command of its own.
		commands: [top, top - 1, all, all - 1],
		skills: [skillDirs, localSkills, shipped].filter(Boolean),
		scorers,
		// docs/README-xx.md files, with and without the English README they translate.
		translations: [readmes, readmes + 1],
		resourceTypes: [union, creatable, creatable + 1].filter(Boolean),
	};
}

export async function measure({ root }) {
	const tree = await commandTree(root);
	if (!tree) throw new Error("cli/dist/program.js is missing or does not load: run `bun install` in cli/");
	if (!has(root, TOOLS)) throw new Error(`${TOOLS} is missing`);
	const names = mcpToolNames(root);
	const tools = parseTools(read(root, TOOLS)).filter((t) => names.includes(t.name));
	const files = proseFiles(root);
	const docs = docListProblems(root, names, files);
	const program = await loadProgram(root);
	const findings = [
		...namingProblems(names).map((f) => `naming ${f}`),
		...descriptionProblems(tools).map((f) => `schema ${f}`),
		...docs.findings.map((f) => `docs ${f}`),
		...countFindings(root, files, countTable(counts(root, tools, tree))).map((f) => `count ${f}`),
		...(program ? cliProblems(program) : []).map((f) => `cli ${f}`),
	];
	return {
		value: findings.length,
		summary: `${names.length} MCP tools, ${findings.length} inconsistencies; tool lists in ${docs.lists.join(", ") || "no doc"}`,
		findings,
	};
}
