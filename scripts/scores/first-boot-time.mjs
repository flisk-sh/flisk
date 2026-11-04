// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Minutes from install to the first healthy URL, as people report it in the "I booted Flisk" form
// (.github/ISSUE_TEMPLATE/i-booted-flisk.yml). The median is the time-to-value a newcomer actually sees, which no
// benchmark on a warm machine can tell us. The answer is free text, so parseMinutes reads "8", "about 8", "~10 minutes",
// "1.5", "1h", "4 min 10 s" and ranges such as "5-10" (the upper bound, to stay honest).
import { formFields, issuesWithLabel, median, percentile, round1 } from "./lib.mjs";

export const meta = {
	id: "first-boot-time",
	title: "Minutes to the first healthy URL (boot reports)",
	source: "gh",
	mode: "report",
	better: "lower",
	unit: "min",
};

export const LABEL = "show-and-tell";
export const TITLE = /^boot:/i;
export const FIELD = "Minutes until first healthy URL";

// A number and the unit right after it, if any; a word that is not a unit ("to", "warm") is left alone. A number
// without a unit is minutes, because that is what the field asks for.
const TOKEN = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)?(?![a-z])/g;
const MINUTES_PER = { h: 60, m: 1, s: 1 / 60 };
const RANGE = /^\s*(-|–|—|to)\s*$/;

// The minutes in a free-text answer, or null when it holds no number.
export function parseMinutes(text) {
	const s = String(text ?? "")
		.toLowerCase()
		.replace(/(\d),(\d)/g, "$1.$2");
	const tokens = [...s.matchAll(TOKEN)].map((m) => ({
		n: Number(m[1]),
		unit: m[2] ? MINUTES_PER[m[2][0]] : null,
		start: m.index,
		end: m.index + m[0].length,
	}));
	if (!tokens.length) return null;
	const [a, b] = tokens;
	const gap = b ? s.slice(a.end, b.start) : "";
	// "5-10", "5 to 10 min", "1-2h": the upper bound, in the unit written after it (or before it).
	if (b && RANGE.test(gap)) return b.n * (b.unit ?? a.unit ?? 1);
	// "1h 30m", "4 min 10 s", "1h30": one duration written in parts, largest unit first. A bare number after a unit
	// is the next smaller unit. Anything else ("8 (cold), 2 warm") is a second answer and is ignored.
	let total = a.n * (a.unit ?? 1);
	let last = a.unit;
	for (let i = 1; last !== null && i < tokens.length; i++) {
		const t = tokens[i];
		if (!/^\s*(and\s*)?$/.test(s.slice(tokens[i - 1].end, t.start))) break;
		const unit = t.unit ?? (last === 60 ? 1 : last === 1 ? 1 / 60 : null);
		if (unit === null || unit >= last) break;
		total += t.n * unit;
		last = unit;
	}
	return total;
}

export function measure(ctx) {
	const minutes = [];
	const findings = [];
	for (const issue of issuesWithLabel(ctx.gh, ctx.repo, LABEL)) {
		const f = formFields(issue.body);
		if (!TITLE.test(issue.title ?? "") && !(FIELD in f)) continue;
		const answer = f[FIELD];
		const m = parseMinutes(answer);
		if (m !== null) minutes.push(m);
		else if (answer === undefined) findings.push(`#${issue.number} has no "${FIELD}" field`);
		else if (answer === "_No response_" || answer === "") findings.push(`#${issue.number} left the minutes empty`);
		else findings.push(`#${issue.number} no number in "${answer.slice(0, 60)}"`);
	}
	if (!minutes.length) return { value: null, summary: "no boot report with a number yet", findings };
	return {
		value: round1(median(minutes)),
		summary: `n=${minutes.length}, median ${round1(median(minutes))} min, p75 ${round1(percentile(minutes, 75))} min`,
		findings,
	};
}
