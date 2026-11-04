#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

// UMUX-Lite score from the "Usability feedback" issues (label ux-feedback).
// Per response: (capabilities - 1 + ease - 1) / 12 * 100. Reports n, the mean and the median, and splits by how people built.
// Usage: node scripts/umux-lite-score.mjs [--repo flisk-sh/flisk] [--json]   (needs the gh CLI, signed in)

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const CAPABILITIES = "“Flisk's capabilities meet my requirements”";
const EASE = "“Flisk is easy to use”";
const HOW = "How did you build it?";

// Issue forms render each field as "### <label>" followed by the answer.
export function formFields(body) {
	const fields = {};
	const parts = String(body ?? "").split(/^###\s+/m).slice(1);
	for (const part of parts) {
		const nl = part.indexOf("\n");
		const label = (nl === -1 ? part : part.slice(0, nl)).trim();
		fields[label] = (nl === -1 ? "" : part.slice(nl + 1)).trim();
	}
	return fields;
}

export function rating(value) {
	const m = /^\s*([1-7])(?!\d)/.exec(String(value ?? ""));
	return m ? Number(m[1]) : null;
}

export function scoreResponse(body) {
	const f = formFields(body);
	const capabilities = rating(f[CAPABILITIES]);
	const ease = rating(f[EASE]);
	if (capabilities === null || ease === null) return null;
	const how = f[HOW] && f[HOW] !== "_No response_" ? f[HOW] : "not answered";
	return { capabilities, ease, how, score: ((capabilities - 1 + ease - 1) / 12) * 100 };
}

export function summarize(responses) {
	const scores = responses.map((r) => r.score).sort((a, b) => a - b);
	const n = scores.length;
	if (!n) return { n: 0, mean: null, median: null };
	const mid = Math.floor(n / 2);
	return {
		n,
		mean: scores.reduce((a, b) => a + b, 0) / n,
		median: n % 2 ? scores[mid] : (scores[mid - 1] + scores[mid]) / 2,
	};
}

function main() {
	const { values } = parseArgs({ options: { repo: { type: "string", default: "flisk-sh/flisk" }, json: { type: "boolean", default: false } } });
	const raw = execFileSync(
		"gh",
		["issue", "list", "-R", values.repo, "--label", "ux-feedback", "--state", "all", "--limit", "1000", "--json", "number,body,createdAt"],
		{ encoding: "utf8" },
	);
	const issues = JSON.parse(raw);
	const responses = [];
	const skipped = [];
	for (const issue of issues) {
		const r = scoreResponse(issue.body);
		if (r) responses.push({ number: issue.number, createdAt: issue.createdAt, ...r });
		else skipped.push(issue.number);
	}
	const byHow = {};
	for (const r of responses) (byHow[r.how] ??= []).push(r);
	const report = {
		repo: values.repo,
		overall: summarize(responses),
		byHow: Object.fromEntries(Object.entries(byHow).map(([k, v]) => [k, summarize(v)])),
		skipped,
		responses,
	};
	if (values.json) {
		console.log(JSON.stringify(report, null, 2));
		return;
	}
	const fmt = (s) => (s.n ? `n=${s.n}  mean ${s.mean.toFixed(1)}  median ${s.median.toFixed(1)}` : "n=0");
	console.log(`UMUX-Lite, ${values.repo} (label ux-feedback): ${fmt(report.overall)}`);
	for (const [how, s] of Object.entries(report.byHow)) console.log(`  ${how}: ${fmt(s)}`);
	if (skipped.length) console.log(`  not scored (missing or invalid ratings): #${skipped.join(", #")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
