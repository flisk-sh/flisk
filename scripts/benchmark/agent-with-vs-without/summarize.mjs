#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

// Reads <results>/raw/*/metrics.json and writes summary.json and summary.md (median, min, max per prompt and arm).
// Usage: node scripts/benchmark/agent-with-vs-without/summarize.mjs <results-dir>

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = resolve(process.argv[2] ?? ".");
const rawDir = join(dir, "raw");
if (!existsSync(rawDir)) {
	console.error(`summarize: no raw/ folder in ${dir}`);
	process.exit(1);
}
const runs = readdirSync(rawDir)
	.filter((n) => existsSync(join(rawDir, n, "metrics.json")))
	.map((n) => JSON.parse(readFileSync(join(rawDir, n, "metrics.json"), "utf8")))
	.sort((a, b) => a.prompt.localeCompare(b.prompt) || a.arm.localeCompare(b.arm) || a.run - b.run);

function stats(values) {
	const v = values.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
	if (!v.length) return { n: 0, median: null, min: null, max: null };
	const mid = Math.floor(v.length / 2);
	const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
	return { n: v.length, median, min: v[0], max: v[v.length - 1] };
}

const METRICS = {
	timeToHealthySec: (r) => r.timeToHealthySec,
	agentWallSec: (r) => r.agentWallSec,
	totalTokens: (r) => r.tokens?.total,
	outputTokens: (r) => r.tokens?.output,
	costUsd: (r) => r.costUsd,
	numTurns: (r) => r.numTurns,
	infraFilesHandWritten: (r) => r.infraFilesHandWritten,
	toolErrors: (r) => r.toolErrors,
	retriesAfterError: (r) => r.retriesAfterError,
};

const groups = {};
for (const r of runs) {
	const key = `${r.prompt}|${r.arm}`;
	if (!groups[key]) groups[key] = [];
	groups[key].push(r);
}
const summary = Object.entries(groups).map(([key, rs]) => {
	const [prompt, arm] = key.split("|");
	const out = { prompt, arm, runs: rs.length, succeeded: rs.filter((r) => r.success).length, failures: rs.filter((r) => !r.success).map((r) => ({ id: r.id, failure: r.failure })) };
	// Time to healthy is only defined for successful runs; every other metric covers every run, failed ones included.
	for (const [name, get] of Object.entries(METRICS)) out[name] = stats(rs.filter((r) => name !== "timeToHealthySec" || r.success).map(get));
	return out;
});
const runsPerArm = Math.max(0, ...summary.map((s) => s.runs));
writeFileSync(join(dir, "summary.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), label: `n=${runsPerArm}`, runsPerArm, summary, runs: runs.map((r) => r.id) }, null, 2)}\n`);

const env = existsSync(join(dir, "environment.json")) ? JSON.parse(readFileSync(join(dir, "environment.json"), "utf8")) : {};
const fmt = (s, digits = 0, unit = "") => {
	if (!s.n) return "–";
	if (s.n === 1) return `${s.median.toFixed(digits)}${unit}`;
	return `${s.median.toFixed(digits)}${unit} (${s.min.toFixed(digits)}–${s.max.toFixed(digits)})`;
};
const md = [];
md.push("# Coding agent with vs without Flisk", "");
const n = Math.max(0, ...summary.map((s) => s.runs));
const nNote =
	n === 1
		? "**n=1: one run per prompt and arm.** Each cell is that single run, not a median; a second run can differ a lot."
		: `Cells are **median (min–max)** over up to ${n} runs per prompt and arm.`;
md.push(`Same prompt, same agent (\`claude -p\`, model ${[...new Set(runs.map((r) => r.model).filter(Boolean))].join(", ") || env.requestedModel}), fresh empty folder per run. ${nNote} Time to healthy counts successful runs only; the other columns count every run.`, "");
md.push("| Prompt | Arm | Succeeded | Time to healthy (s) | Total tokens | Cost (USD) | Turns | Infra/config files hand-written | Tool errors | Retries after an error |");
md.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const s of summary)
	md.push(`| ${s.prompt} | ${s.arm} | ${s.succeeded}/${s.runs} | ${fmt(s.timeToHealthySec)} | ${fmt(s.totalTokens)} | ${fmt(s.costUsd, 2)} | ${fmt(s.numTurns)} | ${fmt(s.infraFilesHandWritten)} | ${fmt(s.toolErrors)} | ${fmt(s.retriesAfterError)} |`);
md.push("", "## Every run", "");
md.push("| Run | Success | Time to healthy (s) | Agent wall (s) | Total tokens | Output tokens | Cost (USD) | Turns | Infra files | Tool errors | Skills used | Failure |");
md.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|");
for (const r of runs)
	md.push(`| ${r.id} | ${r.success ? "yes" : "**no**"} | ${r.timeToHealthySec?.toFixed(0) ?? "–"} | ${r.agentWallSec.toFixed(0)} | ${r.tokens?.total ?? "–"} | ${r.tokens?.output ?? "–"} | ${r.costUsd?.toFixed(2) ?? "–"} | ${r.numTurns ?? "–"} | ${r.infraFilesHandWritten} | ${r.toolErrors} | ${(r.skillsInvoked ?? []).join(", ") || "–"} | ${r.failure ?? ""} |`);
md.push("", "## Hand-written infrastructure and config files", "");
for (const r of runs) md.push(`- **${r.id}**: ${r.infraFiles.length ? r.infraFiles.map((f) => `\`${f.path}\``).join(", ") : "none"}`);
md.push("", "## Environment", "");
for (const [k, v] of Object.entries(env)) if (typeof v !== "object") md.push(`- ${k}: ${v}`);
md.push("", "Raw data: `raw/<run>/metrics.json` (all measurements), `raw/<run>/transcript.jsonl.gz` (the agent's events, long outputs cut, home folder replaced by `~`), `raw/<run>/files.txt` (the files in the run folder, without `node_modules`).", "");
writeFileSync(join(dir, "summary.md"), md.join("\n"));
console.log(md.slice(0, 4 + summary.length + 2).join("\n"));
