// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The guidance an agent reads before it edits — every AGENTS.md and CLAUDE.md, and .claude/memory/MEMORY.md — names
// files in backticks, and the agent opens them as written. A path that no longer exists sends it to the wrong place or
// makes it invent one. A backticked path counts as a repo path when its first segment is an entry at the repo root
// (cli/, runtime/, docs/, scripts/, ...): that one must exist. The old top-level engine/, discovery/, specs/ and ext/
// moved under runtime/ (#2060), so such a path whose runtime/ twin exists is stale too; inside a vendored project
// they are still real names, so a path that only goes one level deep is left alone. Paths in fenced code, globs and
// placeholders are not read. A path git ignores (cli/test-results/, cli/coverage/: output a local run creates) exists
// in some checkouts and not others, so it is not checked: the result must not depend on what ran before. Gate at zero.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { has, read, walk } from "./lib.mjs";

export const meta = {
	id: "agents-md-paths",
	title: "Paths in agent guidance files that exist",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "stale paths",
};

export const MOVED_ROOTS = ["engine", "discovery", "specs", "ext"];

// Not this checkout's guidance: other agents' working copies (.claude/worktrees/), proposals (openspec/), and the
// gitignored copies of runtime/ that the CLI build makes (cli/engine/, ...; a finding there is fixed in runtime/).
const isGuidance = (rel) =>
	(/(^|\/)(AGENTS|CLAUDE)\.md$/.test(rel) || rel === ".claude/memory/MEMORY.md") &&
	!/^(openspec|\.claude\/worktrees|cli\/(discovery|engine|ext|specs))\//.test(rel);

// Backticked repo-style paths outside fenced code: { line, path }.
export function backtickedPaths(markdown) {
	const out = [];
	let fenced = false;
	markdown.split("\n").forEach((line, i) => {
		if (/^\s*(```|~~~)/.test(line)) {
			fenced = !fenced;
			return;
		}
		if (fenced) return;
		for (const m of line.matchAll(/`([^`\s]+)`/g)) {
			const p = m[1].replace(/[.,;:)]+$/, "").replace(/:\d+(-\d+)?$/, "");
			if (p.includes("/") && /^[\w.\-/]+$/.test(p)) out.push({ line: i + 1, path: p });
		}
	});
	return out;
}

// Why a path is stale, or null. roots: the names at the repo root.
export function staleReason(root, roots, p) {
	const first = p.split("/")[0];
	if (roots.has(first)) return has(root, p) ? null : "no such file or directory";
	if (MOVED_ROOTS.includes(first) && p.replace(/\/$/, "").split("/").length >= 3 && has(root, `runtime/${p}`))
		return `moved to runtime/${p}`;
	return null;
}

// A path git can name relative to the checkout: not absolute (/var/folders), not out of it (../x).
const inRepo = (p) => {
	const n = path.posix.normalize(p);
	return !n.startsWith("/") && n !== ".." && !n.startsWith("../");
};

// The paths .gitignore ignores, of the ones given. git exits 1 when none is ignored; outside a checkout (a test
// fixture) it fails, and then none is. One path git cannot resolve ends the whole run with "outside repository"
// (exit 128) and drops every ignored path after it, so only paths inside the checkout are handed over.
export function gitIgnored(root, paths) {
	const inside = paths.filter(inRepo);
	if (!inside.length) return new Set();
	const lines = (text) => new Set(String(text ?? "").split("\n").filter(Boolean));
	try {
		return lines(
			execFileSync("git", ["check-ignore", "--stdin"], {
				cwd: root,
				input: inside.join("\n"),
				encoding: "utf8",
				stdio: ["pipe", "pipe", "ignore"],
			}),
		);
	} catch (error) {
		return lines(error.stdout);
	}
}

export function measure({ root }) {
	const roots = new Set(readdirSync(root).filter((n) => n !== ".git" && n !== "node_modules"));
	const files = walk(root, ".", isGuidance);
	const mentions = files.flatMap((rel) => backtickedPaths(read(root, rel)).map((m) => ({ rel, ...m })));
	const ignored = gitIgnored(root, [...new Set(mentions.map((m) => m.path))]);
	const findings = [];
	let checked = 0;
	for (const { rel, line, path: p } of mentions) {
		if (ignored.has(p)) continue;
		const why = staleReason(root, roots, p);
		if (why === null && !roots.has(p.split("/")[0])) continue;
		checked++;
		if (why) findings.push(`${rel}:${line} \`${p}\`: ${why}`);
	}
	return {
		value: findings.length,
		summary: `${checked} repo paths in ${files.length} agent guidance files, ${findings.length} stale`,
		findings,
	};
}
