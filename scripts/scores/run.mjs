// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// One scoreboard for every scorer in scripts/scores/. A scorer is a file exporting `meta` and `measure(ctx)`:
//   meta     { id, title, source, mode, better: "higher"|"lower", unit, target?, tolerance? }
//   measure  returns { value, max?, summary?, findings?: string[] }; value null means "no data" and the row is skipped.
// gate rows must meet meta.target; ratchet rows must not be worse than scripts/scores/baseline.json (tolerance is a
// fraction of the baseline, for noisy numbers such as sizes); report rows never fail. Every score is computed from files,
// a CI artifact or GitHub API counts: no model is involved, so the same input always gives the same score.
//
//   node scripts/scores/run.mjs [--source files|artifact|gh|all] [--only id,id] [--json|--markdown] [--check]
//                               [--update-baseline] [--tarball f.tgz] [--lighthouse lhr.json] [--mutation mutation.json]
//                               [--repo owner/name] [--root dir]
// --source defaults to files, the set that runs on every pull request. --check exits 1 when a gate or ratchet fails or a
// scorer throws. --update-baseline records each ratchet's current value when it is better than the recorded one; it
// never lowers a baseline.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { ghJson, MODES, SOURCES } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BASELINE_FILE = path.join(HERE, "baseline.json");

// Every scorer in dir, or only the named ones: --only imports nothing else, so a job that runs one artifact scorer does
// not need the dependencies (cli/dist, typescript) the files scorers load.
export async function loadScorers(dir = HERE, only = null) {
	const files = readdirSync(dir)
		.filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs") && !["run.mjs", "lib.mjs"].includes(f))
		.filter((f) => !only || only.includes(f.replace(/\.mjs$/, "")))
		.sort();
	const scorers = [];
	for (const file of files) {
		const mod = await import(pathToFileURL(path.join(dir, file)).href);
		scorers.push({ file, meta: mod.meta, measure: mod.measure });
	}
	return scorers;
}

// Problems with a scorer's declaration, so a typo fails the unit tests instead of silently never gating.
export function metaProblems(scorer, baseline) {
	const { meta, file } = scorer;
	const problems = [];
	if (!meta || typeof scorer.measure !== "function") return [`${file}: must export meta and measure`];
	if (`${meta.id}.mjs` !== file) problems.push(`${file}: meta.id must be the file name`);
	if (!meta.title) problems.push(`${file}: meta.title is empty`);
	if (!SOURCES.includes(meta.source)) problems.push(`${file}: meta.source must be one of ${SOURCES.join(", ")}`);
	if (!MODES.includes(meta.mode)) problems.push(`${file}: meta.mode must be one of ${MODES.join(", ")}`);
	if (!["higher", "lower"].includes(meta.better)) problems.push(`${file}: meta.better must be higher or lower`);
	if (meta.mode === "gate" && typeof meta.target !== "number") problems.push(`${file}: a gate needs a numeric target`);
	if (meta.mode === "ratchet" && typeof baseline[meta.id] !== "number")
		problems.push(`${file}: a ratchet needs a baseline in baseline.json`);
	return problems;
}

const better = (meta, a, b) => (meta.better === "higher" ? a > b : a < b);

export function verdict(meta, value, baseline) {
	if (value === null || value === undefined) return { status: "skip" };
	if (meta.mode === "report") return { status: "report" };
	if (meta.mode === "gate") {
		const ok = meta.better === "higher" ? value >= meta.target : value <= meta.target;
		return ok ? { status: "pass" } : { status: "fail", reason: `target ${meta.target}` };
	}
	const base = baseline[meta.id];
	if (typeof base !== "number") return { status: "fail", reason: "no baseline recorded" };
	const tol = meta.tolerance ?? 0;
	const limit = meta.better === "higher" ? base * (1 - tol) : base * (1 + tol);
	const ok = meta.better === "higher" ? value >= limit : value <= limit;
	return ok ? { status: "pass" } : { status: "fail", reason: `baseline ${base}` };
}

export async function runScorers(scorers, ctx, baseline) {
	const rows = [];
	for (const { meta, measure } of scorers) {
		let result;
		try {
			result = (await measure(ctx)) ?? { value: null };
		} catch (err) {
			rows.push({ ...meta, value: null, status: "error", reason: String(err?.message ?? err).split("\n")[0], findings: [] });
			continue;
		}
		const v = verdict(meta, result.value, baseline);
		rows.push({ ...meta, ...result, findings: result.findings ?? [], ...v, baseline: baseline[meta.id] });
	}
	return rows;
}

// The recorded baselines after this run: a ratchet only moves when the new value is better.
export function nextBaseline(rows, baseline) {
	const next = { ...baseline };
	for (const r of rows) {
		if (r.mode !== "ratchet" || typeof r.value !== "number") continue;
		if (typeof next[r.id] !== "number" || better(r, r.value, next[r.id])) next[r.id] = r.value;
	}
	return Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
}

const shown = (r) => {
	if (r.value === null || r.value === undefined) return "-";
	return `${r.value}${r.max !== undefined ? `/${r.max}` : ""}${r.unit ? ` ${r.unit}` : ""}`;
};

export function renderText(rows) {
	const lines = [];
	for (const r of rows) {
		const why = r.reason ? ` (${r.reason})` : "";
		lines.push(`${r.status.padEnd(6)} ${r.id.padEnd(24)} ${shown(r).padEnd(18)} ${r.title}${why}`);
		if (r.summary) lines.push(`${" ".repeat(32)}${r.summary}`);
		if (["fail", "error"].includes(r.status))
			for (const f of r.findings.slice(0, 10)) lines.push(`${" ".repeat(32)}- ${f}`);
	}
	return lines.join("\n");
}

export function renderMarkdown(rows) {
	const icon = { pass: "pass", fail: "**fail**", error: "**error**", skip: "skip", report: "report" };
	const lines = ["### Scoreboard", "", "| Scorer | Score | Mode | Result |", "| --- | --- | --- | --- |"];
	for (const r of rows) {
		const why = r.reason ? ` (${r.reason})` : "";
		lines.push(`| \`${r.id}\` ${r.title} | ${shown(r)} | ${r.mode} | ${icon[r.status]}${why} |`);
	}
	for (const r of rows.filter((x) => x.summary || x.findings.length)) {
		lines.push("", `<details><summary><code>${r.id}</code> ${r.summary ?? ""}</summary>`, "");
		for (const f of r.findings.slice(0, 50)) lines.push(`- ${f}`);
		lines.push("", "</details>");
	}
	return lines.join("\n");
}

export function readBaseline(file = BASELINE_FILE) {
	try {
		return JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return {};
	}
}

async function main() {
	const { values } = parseArgs({
		options: {
			source: { type: "string", default: "files" },
			only: { type: "string" },
			json: { type: "boolean", default: false },
			markdown: { type: "boolean", default: false },
			check: { type: "boolean", default: false },
			"update-baseline": { type: "boolean", default: false },
			tarball: { type: "string" },
			lighthouse: { type: "string" },
			mutation: { type: "string" },
			repo: { type: "string", default: "flisk-sh/flisk" },
			root: { type: "string", default: path.resolve(HERE, "../..") },
		},
	});
	const sources = values.source === "all" ? SOURCES : values.source.split(",");
	const only = values.only?.split(",");
	const baseline = readBaseline();
	const scorers = (await loadScorers(HERE, only)).filter((s) => only || sources.includes(s.meta.source));
	if (only) {
		const unknown = only.filter((id) => !scorers.some((s) => s.meta.id === id));
		if (unknown.length) throw new Error(`unknown scorer: ${unknown.join(", ")}`);
	}
	const ctx = {
		root: path.resolve(values.root),
		repo: values.repo,
		tarball: values.tarball,
		lighthouse: values.lighthouse,
		mutation: values.mutation,
		gh: ghJson,
		now: new Date(),
	};
	const rows = await runScorers(scorers, ctx, baseline);
	if (values.json) console.log(JSON.stringify(rows, null, 2));
	else if (values.markdown) console.log(renderMarkdown(rows));
	else console.log(renderText(rows));
	if (values["update-baseline"]) writeFileSync(BASELINE_FILE, `${JSON.stringify(nextBaseline(rows, baseline), null, "\t")}\n`);
	if (values.check && rows.some((r) => ["fail", "error"].includes(r.status))) return 1;
	return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().then(
		(code) => {
			process.exitCode = code;
		},
		(err) => {
			console.error(err.message);
			process.exitCode = 2;
		},
	);
}
