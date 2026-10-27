// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Relative links in the repo's Markdown must resolve. A reader who follows a link from the README, AGENTS.md, a guide
// or a skill to a file that was moved or renamed lands on a GitHub 404, and an agent that reads the link as a pointer
// opens nothing. Checked: `[text](target)`, `![alt](target)`, `[id]: target` and `<a href>` / `<img src>` whose target
// is a path (no scheme, not an #anchor alone, not a template). The #fragment and ?query are dropped; the path resolves
// against the file's folder, or the repo root when it starts with `/`, the way GitHub renders it, and must exist with
// that exact case (a link that works on a case-insensitive Mac breaks on Linux CI and on GitHub). Links in fenced code
// and inline code are examples, not links. Anchors are not checked. Gate at zero broken links.
import { readdirSync } from "node:fs";
import path from "node:path";
import { localSkillDocs, read, walk } from "./lib.mjs";

export const meta = {
	id: "doc-links",
	title: "Relative links in Markdown resolve",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "broken links",
};

// Markdown outside these is not scanned: the READMEs, AGENTS.md and CLAUDE.md anywhere, docs/, cli/, examples/, runtime/, tests/,
// scripts/ and the skills this repo authors (synced skills are fixed in flisk-skills).
const SCOPE = /(^|\/)(README[^/]*|AGENTS|CLAUDE)\.md$|^(docs|cli|examples|scripts|runtime|tests)\/.*\.md$/;

// Files in scope that are not scanned, each with the reason.
const SKIPPED = [
	{
		re: /^\.claude\//,
		reason: "other agents' worktrees, and skills synced from flisk-skills; the local skills are added from LOCAL",
	},
	{ re: /^openspec\//, reason: "proposals and archived changes link to files as they were when written" },
	{ re: /(^|\/)CHANGELOG\.md$/, reason: "the changelog records paths that no longer exist" },
	{ re: /^docs\/benchmarks\/results\//, reason: "recorded results" },
	{
		re: /^cli\/(Tiltfile|discovery|engine|ext|specs)(\/|$)/,
		reason: "gitignored copies of runtime/ that the CLI build makes; checked in runtime/",
	},
	{
		re: /^cli\/templates\/agent-skills\//,
		reason: "copies of .claude/skills/<name>/SKILL.md (a test keeps them identical), checked there; `flisk project` rewrites their docs/ links to GitHub URLs",
	},
];

// Links that do not resolve in the checkout on purpose, one entry each { file, target, reason }. An entry that
// matches no broken link is a finding, so the list cannot go stale.
export const ALLOWED = [];

const skipped = (rel) => SKIPPED.some((s) => s.re.test(rel));

// The Markdown files to check, sorted. A top-level folder that is skipped as a whole is not walked at all (.claude
// holds whole copies of the repo in worktrees).
export function markdownFiles(root) {
	const keep = (rel) => SCOPE.test(rel) && !skipped(rel);
	const files = readdirSync(root, { withFileTypes: true })
		.filter((d) => !["node_modules", ".git"].includes(d.name) && !skipped(`${d.name}/`))
		.flatMap((d) => (d.isDirectory() ? walk(root, d.name, keep) : keep(d.name) ? [d.name] : []));
	return [...new Set([...files, ...localSkillDocs(root)])].sort();
}

// The text with fenced code blocks and inline code spans blanked out, so offsets and line numbers stay where they were.
export function prose(markdown) {
	const lines = String(markdown).split("\n");
	let fence = null;
	return lines
		.map((line) => {
			const open = /^\s*(```+|~~~+)/.exec(line);
			if (!fence && open) {
				fence = open[1];
				return "";
			}
			if (fence) {
				if (line.trim().startsWith(fence)) fence = null;
				return "";
			}
			return line.replace(/(`+)(?:(?!\1).)+?\1/g, (span) => " ".repeat(span.length));
		})
		.join("\n");
}

const LINK_FORMS = [
	// [text](target) and ![alt](target), the target bare or in <angle brackets>, an optional "title" after it.
	/\]\(\s*(<[^>\n]*>|[^)\s]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)/g,
	// [id]: target, a reference definition at the start of a line.
	/^ {0,3}\[[^\]\n]+\]:\s*(<[^>\n]*>|\S+)/gm,
	// <a href="target"> and <img src="target">.
	/<(?:a|img)\b[^>]*?\s(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
];

// Every link target in a document as { line, target }, in document order.
export function links(markdown) {
	const text = prose(markdown);
	const out = [];
	for (const re of LINK_FORMS)
		for (const m of text.matchAll(re)) {
			const target = (m[1] ?? m[2] ?? "").replace(/^<|>$/g, "");
			out.push({ at: m.index, line: text.slice(0, m.index).split("\n").length, target });
		}
	return out.sort((a, b) => a.at - b.at).map(({ line, target }) => ({ line, target }));
}

// The repo path a link points at, or null when it is not a relative link: a URL with a scheme (https:, mailto:, ...)
// or a //host, an #anchor alone, or a template ({{ }}, <placeholder>, ${var}).
export function linkPath(file, target) {
	const t = target.trim();
	if (!t || t.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith("//")) return null;
	if (/\{\{|<|>|\$\{/.test(t)) return null;
	let p = t.replace(/[?#].*$/, "");
	if (!p) return null;
	try {
		p = decodeURIComponent(p);
	} catch {
		// A stray % stays as written.
	}
	return p.startsWith("/") ? path.posix.normalize(p.slice(1)) : path.posix.join(path.posix.dirname(file), p);
}

// Whether rel exists under root with exactly this case, whatever the file system's case sensitivity.
export function existsExact(root, rel, cache = new Map()) {
	const parts = path.posix.normalize(rel).replace(/\/$/, "").split("/");
	if (parts[0] === ".." || parts[0] === "") return false;
	let dir = "";
	for (const part of parts) {
		if (part === ".") continue;
		if (!cache.has(dir)) {
			try {
				cache.set(dir, new Set(readdirSync(path.join(root, dir))));
			} catch {
				cache.set(dir, new Set());
			}
		}
		if (!cache.get(dir).has(part)) return false;
		dir = dir ? `${dir}/${part}` : part;
	}
	return true;
}

export function measure({ root }, allowed = ALLOWED) {
	const cache = new Map();
	const used = new Set();
	const findings = [];
	let checked = 0;
	const files = markdownFiles(root);
	for (const rel of files)
		for (const { line, target } of links(read(root, rel))) {
			const p = linkPath(rel, target);
			if (p === null) continue;
			checked++;
			if (existsExact(root, p, cache)) continue;
			const known = allowed.find((e) => e.file === rel && e.target === target);
			if (known) {
				used.add(known);
				continue;
			}
			const why = p === ".." || p.startsWith("../") ? "points outside the repository" : `${p} does not exist`;
			findings.push(`${rel}:${line} ${target}: ${why}`);
		}
	for (const e of allowed.filter((x) => !used.has(x)))
		findings.push(`${e.file} ${e.target}: ALLOWED entry no longer matches a broken link; remove it`);
	return {
		value: findings.length,
		summary: `${checked} relative links in ${files.length} Markdown files, ${findings.length} broken`,
		findings,
	};
}
