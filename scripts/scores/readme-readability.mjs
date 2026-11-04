// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// How easy README.md is to read, by the Flesch reading ease formula over its prose (code, HTML, tables, links' targets
// and images removed). 60 to 70 is plain English, below 30 reads like a research paper. It is a proxy for how easy the
// page is, not a usability score, and the competitors scorer applies the same formula to other tools' READMEs so the
// numbers compare. Findings list the infrastructure words a newcomer may not know, with their counts.
import { read, round1 } from "./lib.mjs";

export const meta = {
	id: "readme-readability",
	title: "README reading ease (Flesch)",
	source: "files",
	mode: "report",
	better: "higher",
	unit: "/100",
};

// Words a newcomer to running apps usually does not know. Matched case-insensitively as whole words.
export const JARGON = [
	"docker",
	"compose",
	"tilt",
	"kubernetes",
	"k8s",
	"helm",
	"traefik",
	"container",
	"containers",
	"cluster",
	"ingress",
	"manifest",
	"yaml",
	"orchestration",
];

// The prose of a markdown document: fenced and inline code, comments, HTML tags, table rows and images removed, links
// reduced to their text. Each line that does not end in punctuation (a heading, a list item) ends a sentence.
export function prose(markdown) {
	return String(markdown)
		.replace(/^\s*(```+|~~~+)[\s\S]*?^\s*\1\s*$/gm, " ")
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/`[^`\n]*`/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]+>/g, " ")
		.replace(/&#?\w+;/g, " ")
		.split("\n")
		.filter((l) => !/^\s*\|/.test(l))
		.map((l) => l.replace(/^\s*(#+|[-*+]|\d+\.|>)\s+/, "").replace(/\s+/g, " ").trim())
		.filter((l) => /[\p{L}]/u.test(l))
		.map((l) => (/[.!?:]$/.test(l) ? l : `${l}.`))
		.join(" ");
}

export const words = (text) => text.split(/\s+/).filter((w) => /\p{L}/u.test(w));

// Syllables of an English word by vowel groups, with a silent final "e" dropped; at least one.
export function syllables(word) {
	const w = word.toLowerCase().replace(/[^a-z]/g, "");
	if (!w) return 1;
	const groups = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, "").match(/[aeiouy]+/g);
	return Math.max(1, groups ? groups.length : 0);
}

// Flesch reading ease of markdown, rounded to one decimal, clamped to 0..100; null when there is no prose.
export function readingEase(markdown) {
	const text = prose(markdown);
	const w = words(text);
	if (!w.length) return null;
	const sentences = Math.max(1, (text.match(/[.!?:]+(?=\s|$)/g) ?? []).length);
	const syl = w.reduce((n, x) => n + syllables(x), 0);
	const ease = 206.835 - 1.015 * (w.length / sentences) - 84.6 * (syl / w.length);
	return round1(Math.min(100, Math.max(0, ease)));
}

// Jargon words in the prose, most frequent first, and their share of all words in percent.
export function jargon(markdown) {
	const w = words(prose(markdown)).map((x) => x.toLowerCase().replace(/[^\p{L}\d]/gu, ""));
	const counts = new Map();
	for (const x of w) if (JARGON.includes(x)) counts.set(x, (counts.get(x) ?? 0) + 1);
	const total = [...counts.values()].reduce((a, b) => a + b, 0);
	return {
		share: w.length ? round1((total / w.length) * 100) : 0,
		counts: [...counts.entries()].sort(([a, x], [b, y]) => y - x || a.localeCompare(b)),
	};
}

export function measure(ctx) {
	const md = read(ctx.root, "README.md");
	const value = readingEase(md);
	if (value === null) return { value: null, summary: "README.md has no prose" };
	const j = jargon(md);
	return {
		value,
		summary: `${words(prose(md)).length} words; ${j.share}% infrastructure words`,
		findings: j.counts.map(([word, n]) => `"${word}" ${n}×`),
	};
}
