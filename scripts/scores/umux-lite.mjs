// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// UMUX-Lite, the two-item usability score (capabilities and ease, 1 to 7, scaled to 0-100), from the "Usability
// feedback" form (.github/ISSUE_TEMPLATE/usability-feedback.yml). Only people can answer it, so this is the one real
// UMUX-Lite number; the files scorers are proxies and are never reported as UMUX-Lite. Below MIN_N answers the mean is
// printed but marked too few to trust.
//
// The form's optional "before" questions ask the same two items about the tool the person used before Flisk. Those
// answers give the only honest competitor comparison: the same people rating both tools. Each tool's row compares the
// two means over the people who rated it (the findings; the before-to-after change is the gap between those two means).
//
// The optional "How did you hear about Flisk?" question (id `source`) splits the summary by where people came from, so
// the launch's answers (Product Hunt) read apart from the rest. Each source is quoted with its own n; a blank answer
// ("_No response_") and an issue filed before the question existed are "not answered".
import { formFields, rating, round1 } from "./lib.mjs";
import { scoreResponse, summarize } from "../umux-lite-score.mjs";
import { responses } from "./pmf.mjs";

export const meta = {
	id: "umux-lite",
	title: "UMUX-Lite from the usability form",
	source: "gh",
	mode: "report",
	better: "higher",
	unit: "/100",
};

export const MIN_N = 20;
export const BEFORE = "What did you use before Flisk to run an app like this? (optional)";
export const BEFORE_CAPABILITIES = "“The tool I used before met my requirements” (optional)";
export const BEFORE_EASE = "“The tool I used before was easy to use” (optional)";
export const SOURCE = "How did you hear about Flisk?";
export const SOURCE_OPTIONS = [
	"Product Hunt",
	"Hacker News",
	"GitHub",
	"Search engine",
	"A friend or colleague",
	"Social media",
	"Other",
];
export const NOT_ANSWERED = "not answered";
// Answers that name no tool to compare with.
const NO_TOOL = new Set(["", "_No response_", "Nothing, this was my first time"]);

const umux = (capabilities, ease) => ((capabilities - 1 + ease - 1) / 12) * 100;
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

// The rating of the tool used before, or null when the person named no tool or skipped either item.
export function beforeResponse(body) {
	const f = formFields(body);
	const tool = (f[BEFORE] ?? "").trim();
	const capabilities = rating(f[BEFORE_CAPABILITIES]);
	const ease = rating(f[BEFORE_EASE]);
	if (NO_TOOL.has(tool) || capabilities === null || ease === null) return null;
	return { tool, score: umux(capabilities, ease) };
}

// Where the person heard about Flisk: one of SOURCE_OPTIONS, or "not answered".
export function sourceOf(body) {
	const answer = (formFields(body)[SOURCE] ?? "").trim();
	return SOURCE_OPTIONS.includes(answer) ? answer : NOT_ANSWERED;
}

export function measure(ctx) {
	const scored = responses(ctx.gh, ctx.repo)
		.map((issue) => ({ flisk: scoreResponse(issue.body), before: beforeResponse(issue.body), source: sourceOf(issue.body) }))
		.filter((r) => r.flisk);
	if (!scored.length) return { value: null, summary: "no answers yet" };
	const n = scored.length;
	const value = round1(mean(scored.map((r) => r.flisk.score)));
	const bySource = new Map();
	for (const r of scored) bySource.set(r.source, [...(bySource.get(r.source) ?? []), r.flisk]);
	const sources = [...bySource.entries()]
		.sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b))
		.map(([source, rows]) => `${source} n=${rows.length} mean ${round1(summarize(rows).mean)}`)
		.join(", ");
	const trust = n < MIN_N ? `; fewer than ${MIN_N} answers, too few to trust` : "";
	const byTool = new Map();
	for (const r of scored.filter((x) => x.before)) {
		const rows = byTool.get(r.before.tool) ?? [];
		rows.push(r);
		byTool.set(r.before.tool, rows);
	}
	const findings = [...byTool.entries()]
		.sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b))
		.map(([tool, rows]) => {
			const before = round1(mean(rows.map((r) => r.before.score)));
			const after = round1(mean(rows.map((r) => r.flisk.score)));
			return `${tool}: n=${rows.length}, ${before} for ${tool} vs ${after} for Flisk (same people)`;
		});
	return { value, summary: `n=${n}, mean ${value}, median ${round1(summarize(scored.map((r) => r.flisk)).median)}; by source: ${sources}${trust}`, findings };
}
