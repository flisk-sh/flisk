// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Public wording against docs/claims.md, the claims registry. The registry ends with a `claims-guard` comment block:
//   forbid: phrase | phrase           a phrase no public text may use, unless negated ("not a cold boot") or quoted
//                                     inside the table's own allowed wording
//   caveat: 4.6s => phrase | phrase   every mention of the number (4.6s, 4.6 s, 4.6 seconds) needs one of the phrases
//                                     within CAVEAT_WINDOW characters; a subject that is not a duration is a phrase
// The scorer reads that block, so claims.md stays the single source, and counts violations in the README, docs (drafts
// and translations included), the agent contracts, the skills authored here and the npm descriptions. Translations get only the
// forbid rule, because the caveat phrases are English.
import { has, localSkillDocs, read, walk } from "./lib.mjs";

export const meta = {
	id: "claims-guard",
	title: "Public wording follows the claims registry",
	source: "files",
	mode: "gate",
	better: "lower",
	unit: "violations",
	target: 0,
};

export const REGISTRY = "docs/claims.md";
// How far either side of a number its caveat may sit, in characters.
export const CAVEAT_WINDOW = 300;
// docs/README-uk.md, CONTRIBUTING-ja.md, anything under a translations/ folder.
const LOCALES = "ar|de|el|es|fa|fr|he|hi|id|it|ja|ko|ml|nl|pl|pt|pt-br|ru|sv|th|tr|uk|vi|zh|zh_cn|zh_tw|zh-cn|zh-tw";
const TRANSLATED = new RegExp(`(^|/)translations/|-(${LOCALES})\\.md$`, "i");
// A negation right before a forbidden phrase: "not a cold boot", "no cold boot", "isn't a cold boot".
const NEGATED = /\b(?:not|no|never|isn['’]t|aren['’]t|wasn['’]t)\s+(?:(?:a|an|the)\s+)?$/i;

const list = (s) =>
	s
		.split("|")
		.map((x) => x.trim())
		.filter(Boolean);

// Where a phrase occurs in text, case-insensitively: whole words (a hyphen joins words, so "cold-boot.md" is not "cold
// boot"), any run of whitespace between them so a phrase wrapped across lines still matches. A scan rather than a
// RegExp built from registry text, so the registry's wording is never compiled as a pattern. [{ index, 0: match }].
export function phraseMatches(text, phrase) {
	const words = phrase.trim().toLowerCase().split(/\s+/).filter(Boolean);
	const out = [];
	if (!words.length) return out;
	const lower = foldCase(text);
	const wordChar = (ch) => ch !== undefined && /[\w-]/.test(ch);
	let from = 0;
	while (from <= lower.length) {
		const start = lower.indexOf(words[0], from);
		if (start < 0) break;
		let end = start + words[0].length;
		let whole = !wordChar(lower[start - 1]);
		for (const w of whole ? words.slice(1) : []) {
			let j = end;
			while (j < lower.length && /\s/.test(lower[j])) j++;
			if (j === end || !lower.startsWith(w, j)) {
				whole = false;
				break;
			}
			end = j + w.length;
		}
		if (whole && !wordChar(lower[end])) {
			out.push({ index: start, 0: text.slice(start, end) });
			from = end;
		} else from = start + 1;
	}
	return out;
}

// Lower case with every index kept: a character whose lower case is longer (İ) keeps its own case.
const foldCase = (text) => {
	const lower = text.toLowerCase();
	return lower.length === text.length ? lower : [...text].map((c) => (c.toLowerCase().length === 1 ? c.toLowerCase() : c)).join("");
};

// Where a caveat subject occurs: "4.6s" matches 4.6s, 4.6 s, 4.6 sec and 4.6 seconds but not 14.6s; anything else is
// a phrase.
export function subjectMatches(text, subject) {
	const d = /^(\d+(?:\.\d+)?)\s*s$/i.exec(subject.trim());
	if (!d) return phraseMatches(text, subject);
	const lower = foldCase(text);
	const out = [];
	for (let at = lower.indexOf(d[1]); at >= 0; at = lower.indexOf(d[1], at + 1)) {
		if (/[\d.]/.test(lower[at - 1] ?? "")) continue;
		const after = at + d[1].length;
		const starts = /\s/.test(lower[after] ?? "") ? [after + 1, after] : [after];
		const end = starts
			.flatMap((s) => ["seconds", "second", "secs", "sec", "s"].map((unit) => (lower.startsWith(unit, s) ? s + unit.length : -1)))
			.find((e) => e > 0 && !/\w/.test(lower[e] ?? ""));
		if (end !== undefined) out.push({ index: at, 0: text.slice(at, end) });
	}
	return out;
}

export function parseRules(registry) {
	const block = /<!--\s*claims-guard\b([\s\S]*?)-->/.exec(registry);
	if (!block) return null;
	const rules = { forbid: [], caveats: [] };
	for (const line of block[1].split("\n")) {
		const m = /^\s*(forbid|caveat):\s*(.+)$/.exec(line);
		if (m?.[1] === "forbid") rules.forbid.push(...list(m[2]));
		else if (m?.[1] === "caveat") {
			const [subject, phrases = ""] = m[2].split("=>");
			rules.caveats.push({ subject: subject.trim(), phrases: list(phrases) });
		}
	}
	return rules;
}

// The registry table's "Allowed wording" column, one regex per quoted sentence. A forbidden phrase that sits inside a
// verbatim copy of an allowed sentence is the registry's own wording, not a violation.
export function allowedWording(registry) {
	const rows = registry
		.split("\n")
		.filter((l) => l.trim().startsWith("|") && !/^\|[\s|:-]+\|?$/.test(l.trim()))
		.map((l) =>
			l
				.trim()
				.replace(/^\||\|$/g, "")
				.split("|")
				.map((c) => c.trim()),
		);
	const col = rows[0]?.findIndex((c) => /allowed wording/i.test(c)) ?? -1;
	if (col < 0) return [];
	const out = [];
	for (const row of rows.slice(1))
		for (const q of (row[col] ?? "").matchAll(/“([^”]+)”|"([^"]+)"/g))
			for (const sentence of (q[1] ?? q[2]).split(/(?<=[.!?])\s+/)) if (sentence.trim()) out.push(sentence);
	return out;
}

// Violations in one text. firstLine is the line the text starts on in its file (an npm description sits mid-file).
export function check(rel, text, rules, allowed = [], firstLine = 1) {
	const lineOf = (i) => firstLine + (text.slice(0, i).match(/\n/g)?.length ?? 0);
	const exempt = allowed.flatMap((p) => phraseMatches(text, p).map((m) => [m.index, m.index + m[0].length]));
	const found = [];
	for (const phrase of rules.forbid)
		for (const m of phraseMatches(text, phrase)) {
			const before = text.slice(0, m.index).replace(/[*_`]/g, "");
			if (NEGATED.test(before) || exempt.some(([a, b]) => m.index >= a && m.index < b)) continue;
			found.push({ at: m.index, finding: `${rel}:${lineOf(m.index)} "${phrase}": forbidden` });
		}
	if (!TRANSLATED.test(rel))
		for (const { subject, phrases } of rules.caveats)
			for (const m of subjectMatches(text, subject)) {
				const near = text
					.slice(Math.max(0, m.index - CAVEAT_WINDOW), m.index + m[0].length + CAVEAT_WINDOW)
					.toLowerCase();
				if (phrases.some((p) => near.includes(p.toLowerCase()))) continue;
				found.push({ at: m.index, finding: `${rel}:${lineOf(m.index)} ${subject} without caveat` });
			}
	return found.sort((a, b) => a.at - b.at).map((f) => f.finding);
}

// The public text: path, text and the line it starts on.
export function publicTexts(root) {
	const md = (rel) => rel.endsWith(".md");
	const files = [
		"README.md",
		...walk(root, "docs", md),
		...walk(root, "docs/agents", (rel) => rel.endsWith(".txt")),
		...localSkillDocs(root),
	].filter((rel) => rel !== REGISTRY && has(root, rel));
	const texts = files.map((rel) => ({ rel, text: read(root, rel), firstLine: 1 }));
	for (const rel of ["package.json", "cli/package.json"]) {
		const raw = read(root, rel);
		let description;
		try {
			description = JSON.parse(raw).description;
		} catch {
			continue;
		}
		if (typeof description !== "string") continue;
		const line = raw.split("\n").findIndex((l) => /"description"\s*:/.test(l)) + 1;
		texts.push({ rel, text: description, firstLine: Math.max(line, 1) });
	}
	return texts;
}

export function measure({ root }) {
	const registry = read(root, REGISTRY);
	const rules = parseRules(registry);
	if (!rules) throw new Error(`${REGISTRY} has no claims-guard block`);
	const allowed = allowedWording(registry);
	const texts = publicTexts(root);
	const findings = texts.flatMap(({ rel, text, firstLine }) => check(rel, text, rules, allowed, firstLine));
	const forbidden = findings.filter((f) => f.endsWith(": forbidden")).length;
	return {
		value: findings.length,
		summary: `${forbidden} forbidden, ${findings.length - forbidden} without caveat, in ${texts.length} public texts`,
		findings,
	};
}
