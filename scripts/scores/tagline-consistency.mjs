// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// How many different taglines the public surfaces use: the README H1, the two npm descriptions, the `> ` summary line
// of the two llms files and the H1 of each launch post in docs/launch/. Someone who meets Flisk on npm, on GitHub and
// through an agent should read one product description, not three. Taglines are compared after normalising case,
// punctuation and a leading "Flisk:", "Flisk CLI —" or "Flisk is".
import { read, walk } from "./lib.mjs";

export const meta = {
	id: "tagline-consistency",
	title: "Distinct taglines across public surfaces",
	source: "files",
	mode: "report",
	better: "lower",
	unit: "taglines",
};

const LEAD = /^flisk(?:\s+cli)?(?:\s+core)?\s*(?::|—|–|-|\bis\b)\s*/i;

// The first level-1 heading outside code fences (`# Title` or <h1>), or null.
export function firstH1(markdown) {
	let fence = null;
	for (const line of String(markdown).split("\n")) {
		const f = /^\s*(```+|~~~+)/.exec(line);
		if (f) {
			if (!fence) fence = f[1];
			else if (line.trim().startsWith(fence)) fence = null;
			continue;
		}
		if (fence) continue;
		const h = /^#\s+(.+?)(?:\s+#+)?\s*$/.exec(line) ?? /<h1\b[^>]*>(.*?)<\/h1>/i.exec(line);
		if (h) return h[1].trim();
	}
	return null;
}

const firstQuote = (text) => /^>\s+(.+)$/m.exec(text)?.[1].trim() ?? null;

function description(root, rel) {
	try {
		const d = JSON.parse(read(root, rel)).description;
		return typeof d === "string" ? d.trim() : null;
	} catch {
		return null;
	}
}

// Link markup, HTML tags, the product-name prefix, case and punctuation removed, so wording is all that differs.
export function normalise(text) {
	return String(text)
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]+>/g, " ")
		.trim()
		.replace(LEAD, "")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

export function taglines(root) {
	return [
		{ source: "README.md H1", text: firstH1(read(root, "README.md")) },
		{ source: "package.json description", text: description(root, "package.json") },
		{ source: "cli/package.json description", text: description(root, "cli/package.json") },
		{ source: "docs/agents/llms.txt", text: firstQuote(read(root, "docs/agents/llms.txt")) },
		{ source: "docs/agents/llms-full.txt", text: firstQuote(read(root, "docs/agents/llms-full.txt")) },
		...walk(root, "docs/launch", (rel) => /^docs\/launch\/[^/]+\.md$/.test(rel)).map((rel) => ({
			source: `${rel} H1`,
			text: firstH1(read(root, rel)),
		})),
	];
}

export function measure({ root }) {
	const all = taglines(root);
	const found = all.filter((t) => t.text && normalise(t.text));
	const distinct = new Set(found.map((t) => normalise(t.text)));
	const missing = all.filter((t) => !found.includes(t)).map((t) => t.source);
	return {
		value: found.length ? distinct.size : null,
		summary: `${distinct.size} distinct across ${found.length} sources${missing.length ? `; none in ${missing.join(", ")}` : ""}`,
		findings: all.map((t) => `${t.source}: ${t.text ?? "(none)"}`),
	};
}
