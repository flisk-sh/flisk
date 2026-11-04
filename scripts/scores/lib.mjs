// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Shared helpers for the scorers in scripts/scores/. Each scorer is one file that exports `meta` and `measure(ctx)`;
// run.mjs finds them, applies the gate or the ratchet, and prints one scoreboard. Nothing here calls a model.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export { formFields, rating } from "../umux-lite-score.mjs";

// Where a scorer's data comes from. files: the checkout only (runs on every pull request). artifact: a file another
// CI step produced (an npm tarball, a Lighthouse or Stryker report). gh: the GitHub API through the gh CLI.
export const SOURCES = ["files", "artifact", "gh"];
// gate: must meet meta.target. ratchet: must not be worse than the recorded baseline. report: printed, never fails.
export const MODES = ["gate", "ratchet", "report"];

const SKIP_DIRS = new Set([
	"node_modules",
	"dist",
	"dist-bundle",
	"coverage",
	"test-results",
	".git",
	".flisk",
	".flisk-out",
]);

export const read = (root, rel) => {
	try {
		return readFileSync(path.join(root, rel), "utf8");
	} catch {
		return "";
	}
};

export const has = (root, rel) => existsSync(path.join(root, rel));

// Files under dir (paths relative to root, "/"-separated), skipping dependency and build output and release-dist-*.
export function walk(root, dir, keep = () => true) {
	const out = [];
	const abs = path.join(root, dir);
	if (!existsSync(abs)) return out;
	for (const name of readdirSync(abs).sort()) {
		if (SKIP_DIRS.has(name) || name.startsWith("release-dist")) continue;
		const rel = dir === "." ? name : `${dir}/${name}`;
		if (statSync(path.join(root, rel)).isDirectory()) out.push(...walk(root, rel, keep));
		else if (keep(rel)) out.push(rel);
	}
	return out;
}

// Markdown of the skills this repo authors, the ones .claude/skills/LOCAL lists. The other skills are synced from the
// flisk-skills repo by scripts/sync-flisk-skills.sh, so a finding in them is fixed there, not here.
export function localSkillDocs(root) {
	const names = read(root, ".claude/skills/LOCAL")
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith("#"));
	return names.flatMap((name) => walk(root, `.claude/skills/${name}`, (rel) => rel.endsWith(".md")));
}

// Lower-case GitHub logins from the "GitHub id" column of docs/project/MAINTAINERS.md. The GitHub-data scorers count
// these people as maintainers besides authorAssociation, which the Actions token reports as CONTRIBUTOR for a private
// org member (the first Scoreboard run counted the maintainers' own replies as outside ones).
export function maintainerLogins(root) {
	const cells = (line) =>
		line
			.trim()
			.replace(/^\||\|$/g, "")
			.split("|")
			.map((c) => c.trim());
	const rows = read(root, "docs/project/MAINTAINERS.md")
		.split("\n")
		.filter((l) => l.trim().startsWith("|") && !/^[\s|:-]+$/.test(l));
	const col = rows.length ? cells(rows[0]).findIndex((c) => /^github id$/i.test(c)) : -1;
	if (col < 0) return new Set();
	return new Set(
		rows
			.slice(1)
			.map((l) => cells(l)[col]?.replace(/^@/, "").toLowerCase())
			.filter(Boolean),
	);
}

export const isTestFile = (rel) => /(^|\/)__tests__\//.test(rel) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);

export function median(values) {
	const v = [...values].sort((a, b) => a - b);
	if (!v.length) return null;
	const mid = Math.floor(v.length / 2);
	return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// Nearest-rank percentile, p in 0..100.
export function percentile(values, p) {
	const v = [...values].sort((a, b) => a - b);
	if (!v.length) return null;
	return v[Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1))];
}

export const round1 = (n) => Math.round(n * 10) / 10;

// Fenced code blocks of a markdown document, with the line their body starts on.
export function codeBlocks(markdown) {
	const blocks = [];
	const lines = String(markdown).split("\n");
	let open = null;
	for (let i = 0; i < lines.length; i++) {
		const fence = /^\s*(```+|~~~+)\s*([\w-]*)/.exec(lines[i]);
		if (!open && fence) open = { fence: fence[1], lang: fence[2].toLowerCase(), line: i + 2, body: [] };
		else if (open && lines[i].trim().startsWith(open.fence)) {
			blocks.push({ lang: open.lang, line: open.line, body: open.body.join("\n") });
			open = null;
		} else if (open) open.body.push(lines[i]);
	}
	return blocks;
}

const trees = new Map();

// The CLI's real command tree, read from the committed cli/dist build (the same program the shell completions read),
// or null when the build or its dependencies are missing. Each command: { path: "config verify", options: ["--json"],
// leaf: true, allowUnknown: false }. Root options apply to every command.
export async function commandTree(root) {
	if (!trees.has(root)) trees.set(root, loadTree(root));
	return trees.get(root);
}

async function loadTree(root) {
	const file = path.join(root, "cli/dist/program.js");
	if (!existsSync(file)) return null;
	let program;
	try {
		program = (await import(pathToFileURL(file).href)).createProgram();
	} catch {
		return null;
	}
	const longs = (cmd) => cmd.options.flatMap((o) => [o.long, o.short].filter(Boolean));
	const commands = [];
	const visit = (cmd, prefix) => {
		for (const sub of cmd.commands) {
			const p = [...prefix, sub.name()];
			commands.push({
				path: p.join(" "),
				aliases: sub.aliases(),
				options: longs(sub),
				leaf: sub.commands.length === 0,
				// Commander keeps allowUnknownOption() in a private field; `import` passes unknown flags to flisk-import.
				allowUnknown: sub._allowUnknownOption === true,
			});
			visit(sub, p);
		}
	};
	visit(program, []);
	// `help` is Commander's built-in help command, not a registered one.
	commands.push({ path: "help", aliases: [], options: [], leaf: true, allowUnknown: false });
	return { rootOptions: [...longs(program), "--help", "-h"], commands };
}

// JSON from the gh CLI. Scorers take ctx.gh so tests can pass canned data instead.
export function ghJson(args) {
	return JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
}

// Issues of a repo with the given label, newest first, as { number, title, body, createdAt }.
export function issuesWithLabel(gh, repo, label) {
	return gh([
		"issue",
		"list",
		"-R",
		repo,
		"--label",
		label,
		"--state",
		"all",
		"--limit",
		"1000",
		"--json",
		"number,title,body,createdAt",
	]);
}
