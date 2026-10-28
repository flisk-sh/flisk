// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Environment variables must agree between the code that reads them and the docs that tell people to set them.
// Three findings: a variable the docs name that no code mentions (the docs promise a knob that is gone or never
// existed, or the rename left the doc on a name the code dropped), a FLISK_* variable the shipped code reads that
// no doc, skill or .env.example names (a knob nobody can find), and drift (the same variable under TDK_ and FLISK_,
// or under two spellings of one name, so a user sets one and the code reads the other).
// The repo's own prefixes are FLISK_ (the CLI and engine), TILT_ (the Starlark engine and generated Tiltfile
// settings) and the retired TDK_. Other variables (PORT, DATABASE_URL, NODE_ENV, ...) belong to the services and
// tools the docs talk about, not to Flisk, so they are not compared.
import path from "node:path";
import { codeBlocks, isTestFile, read, walk } from "./lib.mjs";

export const meta = {
	id: "env-var-consistency",
	title: "Environment variables agree between code and docs",
	source: "files",
	mode: "ratchet",
	better: "lower",
	unit: "inconsistencies",
};

const NAME = "(?:FLISK|TILT|TDK)_[A-Z0-9_]*[A-Z0-9]";
// A whole variable name: not part of a longer identifier, and `FLISK_HEALTHCHECK_*` (a family) names no variable.
const NAME_RE = new RegExp(`(?<![A-Za-z0-9_])(${NAME})(?![A-Za-z0-9_*])`, "g");

// Folders and files that are not part of the product or its docs.
const SKIPPED = [
	{ re: /^\.claude\/worktrees\//, reason: "other agents' working copies of this repo" },
	{
		re: /^cli\/(Tiltfile|discovery|engine|ext|specs)(\/|$)/,
		reason: "gitignored copies of runtime/ that the CLI build makes; compared in runtime/",
	},
	{ re: /^openspec\//, reason: "proposals and archived changes describe past and future designs, not the current code" },
	{ re: /(^|\/)CHANGELOG\.md$/, reason: "the changelog records names that no longer exist" },
	{ re: /^docs\/benchmarks\/results\//, reason: "recorded results" },
	{ re: /^docs\/contributing\/translations\//, reason: "translations repeat the English page, which is compared" },
	{
		re: /(^|\/)(package-lock\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml|uv\.lock)$|\.(svg|png|jpe?g|gif|webp|ico|pdf|woff2?|tgz|gz|zip|mp4|webm|cast)$/i,
		reason: "lockfiles and binary files",
	},
	{ re: /^scripts\/scores\//, reason: "the scorers spell variable names as fixtures" },
];

// Shipped code: what a user's machine runs. Variables the scripts, workflows and tests read are contributor knobs
// and are not required to be in the user docs.
const SHIPPED = /^(cli\/(src|templates|shared-platform-engineering)|runtime)\/|^install\.sh$/;

// Variables the shipped code reads that need no doc, one entry each with the reason. An entry that matches nothing
// is a finding, so the list cannot go stale.
export const INTERNAL = [
	{
		name: "FLISK_VERSION_TOO_OLD",
		reason: "an error code in the --json envelope (up.ts), not an environment variable",
	},
];

// Pairs of different names that are different variables on purpose (TILT_X is Tilt's or the engine's, FLISK_X is the
// CLI's). Each needs its reason; a pair that no longer exists is a finding.
export const DISTINCT = [
	{
		pair: ["FLISK_DEBUG", "TILT_DEBUG"],
		reason: "FLISK_DEBUG is the CLI's switch; TILT_DEBUG is read by the Starlark engine and set by the CLI from it",
	},
	{
		pair: ["FLISK_ENV", "TILT_ENV"],
		reason: "TILT_ENV selects the environment in the engine; FLISK_ENV is the value the generated container receives",
	},
	{
		pair: ["FLISK_VERSION", "TILT_VERSION"],
		reason: "FLISK_VERSION pins the Flisk CLI release in CI; TILT_VERSION pins the Tilt binary in images and doctor",
	},
];

const isDoc = (rel) =>
	/\.md$/i.test(rel) || /^docs\/.*\.txt$/.test(rel) || /(^|\/)\.env\.(example|sample)$|\.env\.example$/.test(rel);

const EXT = (rel) => path.extname(rel).toLowerCase();
const TS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".mts"]);
const STAR = new Set([".star", ".hbs", ".py"]);
const SHELL = new Set([".sh", ".bash", ".yml", ".yaml"]);

// Variables a doc names: inside inline code spans or fenced code blocks, with the line.
export function documented(markdown) {
	const text = String(markdown);
	const lines = text.split("\n");
	const fenced = new Set();
	const out = [];
	for (const block of codeBlocks(text)) {
		const body = block.body.split("\n");
		for (let i = block.line - 1; i <= block.line + body.length; i++) fenced.add(i);
		body.forEach((t, i) => {
			for (const m of t.matchAll(NAME_RE)) out.push({ name: m[1], line: block.line + i });
		});
	}
	lines.forEach((t, i) => {
		if (fenced.has(i + 1)) return;
		for (const span of t.matchAll(/`([^`]+)`/g))
			for (const m of span[1].matchAll(NAME_RE)) out.push({ name: m[1], line: i + 1 });
	});
	return out;
}

// Variables a code file reads, with the line. TypeScript and JavaScript: process.env.X, env.X, env["X"], and a quoted
// "X" (the CLI keeps variable names in tables and constants, then reads env[name]). Starlark and templates:
// os.environ and os.getenv. Shell and workflow run blocks: $X, ${X}, ${{ env.X }}. PowerShell: $env:X.
export function reads(rel, text) {
	const ext = EXT(rel);
	const out = [];
	const add = (re, i, line) => {
		for (const m of line.matchAll(re)) out.push({ name: m[1], line: i + 1 });
	};
	const quoted = new RegExp(`["'\`](${NAME})["'\`]`, "g");
	const access = new RegExp(`(?:process\\.env|\\benv)\\s*(?:\\.\\s*(${NAME})\\b)`, "g");
	const star = new RegExp(`os\\.(?:environ(?:\\.get)?|getenv)\\s*[\\[(]\\s*["'](${NAME})["']`, "g");
	const shell = new RegExp(`\\$\\{?(${NAME})\\b|\\benv\\.(${NAME})\\b`, "g");
	const ps = new RegExp(`\\$env:(${NAME})\\b`, "gi");
	text.split("\n").forEach((line, i) => {
		if (TS.has(ext)) {
			add(access, i, line);
			add(quoted, i, line);
		} else if (STAR.has(ext) || path.basename(rel) === "Tiltfile") {
			add(star, i, line);
			if (ext === ".hbs") add(quoted, i, line);
		} else if (SHELL.has(ext) || rel === "install.sh" || path.basename(rel) === "Dockerfile") {
			for (const m of line.matchAll(shell)) out.push({ name: m[1] ?? m[2], line: i + 1 });
		} else if (ext === ".ps1") add(ps, i, line);
	});
	return out;
}

// FLISK_HTTP_PORT and TDK_HTTP_PORT share the key "HTTPPORT"; FLISK_HTTPPORT does too, under a second spelling.
const key = (name) => name.replace(/^(FLISK|TILT|TDK)_/, "").replaceAll("_", "");
const prefix = (name) => name.split("_")[0];

export function measure({ root }, internal = INTERNAL, distinct = DISTINCT) {
	const docs = new Map(); // name -> ["file:line"]
	const mentions = new Map(); // name -> ["file:line"] in code that is not a unit test
	const shippedReads = new Map();
	const readSites = new Map(); // name -> ["file:line"], all readers
	const push = (map, name, site) => map.set(name, [...(map.get(name) ?? []), site]);

	for (const rel of walk(root, ".")) {
		if (SKIPPED.some((s) => s.re.test(rel))) continue;
		const text = read(root, rel);
		if (!text) continue;
		if (isDoc(rel)) {
			for (const d of documented(text)) push(docs, d.name, `${rel}:${d.line}`);
			continue;
		}
		if (isTestFile(rel)) continue;
		text.split("\n").forEach((line, i) => {
			for (const m of line.matchAll(NAME_RE)) push(mentions, m[1], `${rel}:${i + 1}`);
		});
		for (const r of reads(rel, text)) {
			push(readSites, r.name, `${rel}:${r.line}`);
			if (SHIPPED.test(rel)) push(shippedReads, r.name, `${rel}:${r.line}`);
		}
	}

	const findings = [];
	const used = new Set();

	for (const [name, sites] of [...docs].sort()) {
		if (prefix(name) === "TDK") continue; // old prefix in a doc is legacy-names' finding, and drift reports twins
		if (!mentions.has(name)) findings.push(`${sites[0]} ${name}: documented, but no code mentions it`);
	}

	for (const [name, sites] of [...shippedReads].sort()) {
		if (prefix(name) !== "FLISK") continue;
		if (docs.has(name)) continue;
		const known = internal.find((e) => e.name === name);
		if (known) {
			used.add(known);
			continue;
		}
		findings.push(`${sites[0]} ${name}: read by the shipped code, but no doc names it`);
	}

	// Drift. The same key under two names: TDK_X still read or documented next to FLISK_X, or two spellings.
	const all = new Set([...docs.keys(), ...mentions.keys()]);
	const byKey = new Map();
	for (const name of all) push(byKey, key(name), name);
	const usedPairs = new Set();
	for (const [, names] of [...byKey].sort()) {
		if (names.length < 2) continue;
		const sorted = [...names].sort();
		const flisk = sorted.filter((n) => prefix(n) === "FLISK");
		// TDK_X that something reads or documents while FLISK_X exists. Tests that strip TDK_ are not reads.
		for (const tdk of sorted.filter((n) => prefix(n) === "TDK")) {
			const sites = [...(readSites.get(tdk) ?? []), ...(docs.get(tdk) ?? [])];
			if (flisk.length && sites.length) findings.push(`${sites[0]} ${tdk}: drift, the code reads ${flisk.join(", ")}`);
		}
		// Two spellings under one prefix (HTTP_PORT and HTTPPORT).
		for (const p of ["FLISK", "TILT"]) {
			const same = sorted.filter((n) => prefix(n) === p);
			if (same.length > 1) findings.push(`${(docs.get(same[0]) ?? mentions.get(same[0]))[0]} ${same.join(" vs ")}: one name, two spellings`);
		}
		// FLISK_X and TILT_X.
		const tilt = sorted.filter((n) => prefix(n) === "TILT");
		for (const f of flisk)
			for (const t of tilt) {
				const known = distinct.find((e) => e.pair.includes(f) && e.pair.includes(t));
				if (known) usedPairs.add(known);
				else findings.push(`${(docs.get(f) ?? mentions.get(f))[0]} ${f} vs ${t}: same name under two prefixes`);
			}
	}

	for (const e of internal.filter((x) => !used.has(x)))
		findings.push(`${e.name}: INTERNAL entry no longer matches a read variable; remove it`);
	for (const e of distinct.filter((x) => !usedPairs.has(x)))
		findings.push(`${e.pair.join(" vs ")}: DISTINCT entry no longer matches two prefixes of one name; remove it`);

	return {
		value: findings.length,
		summary: `${docs.size} documented, ${mentions.size} mentioned in code, ${findings.length} inconsistencies`,
		findings,
	};
}
