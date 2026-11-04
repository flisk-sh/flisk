// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// How many translated READMEs (docs/README-*.md) give a different quickstart from README.md. The quickstart is the
// first shell block that runs `flisk up` ("In your terminal" in the English README). Only the lines that start with
// `flisk ` or `npm install` are compared, in order: a translation may name its directory differently on purpose, but a
// reader who follows an old command sequence gets a different stack from the one the English README promises.
import { codeBlocks, read, walk } from "./lib.mjs";

export const meta = {
	id: "translation-drift",
	title: "Translated READMEs whose quickstart drifted from README.md",
	source: "files",
	mode: "ratchet",
	better: "lower",
	unit: "translations",
};

const SHELLS = ["bash", "sh", "shell", "zsh"];
export const FLISK_UP = /(^|[\s;&|(])flisk\s+up\b/m;
export const FLISK_IMPORT = /(^|[\s;&|(])flisk\s+import\b/m;

// A README's quickstart: its first shell code block that runs `flisk up` ({ lang, line, body }), or null. A block that runs
// `flisk import` is the Compose path at the top of the English README, not the from-scratch quickstart the translations
// carry, so it is skipped.
export function quickstart(markdown) {
	return (
		codeBlocks(markdown).find(
			(b) => SHELLS.includes(b.lang) && FLISK_UP.test(b.body) && !FLISK_IMPORT.test(b.body),
		) ?? null
	);
}

// The commands of a shell block in order: continuation lines joined, blank and comment lines and a `$ ` prompt dropped,
// `a && b` and `a; b` split into two, trailing comments and repeated spaces removed.
export function shellCommands(body) {
	return String(body)
		.replace(/\\\n/g, " ")
		.split("\n")
		.map((l) => l.trim().replace(/^\$\s+/, ""))
		.filter((l) => l && !l.startsWith("#"))
		.flatMap((l) => l.split(/\s*(?:&&|;)\s*/))
		.map((c) => c.replace(/\s+#.*$/, "").replace(/\s+/g, " ").trim())
		.filter(Boolean);
}

const compared = (body) => shellCommands(body).filter((c) => /^(?:flisk |npm install\b)/.test(c));

// Multiset difference: the items of a that b does not have.
function without(a, b) {
	const left = [...b];
	return a.filter((x) => {
		const i = left.indexOf(x);
		if (i < 0) return true;
		left.splice(i, 1);
		return false;
	});
}

// How a translation's quickstart differs from the English one; [] when the compared commands match.
export function drift(englishBody, translatedBody) {
	if (translatedBody === null || translatedBody === undefined) return ["no quickstart (no shell block runs flisk up)"];
	const want = compared(englishBody);
	const got = compared(translatedBody);
	if (want.join("\n") === got.join("\n")) return [];
	const out = [
		...without(want, got).map((c) => `missing "${c}"`),
		...without(got, want).map((c) => `extra "${c}"`),
	];
	return out.length ? out : ["same commands in a different order"];
}

export function measure({ root }) {
	const english = quickstart(read(root, "README.md"));
	if (!english) throw new Error("README.md has no shell block that runs flisk up");
	const translations = walk(root, "docs", (rel) => /^docs\/README-[^/]+\.md$/.test(rel));
	const findings = [];
	let drifted = 0;
	for (const rel of translations) {
		const problems = drift(english.body, quickstart(read(root, rel))?.body ?? null);
		if (problems.length) drifted++;
		findings.push(...problems.map((p) => `${rel}: ${p}`));
	}
	return {
		value: drifted,
		summary: `${drifted} of ${translations.length} translations differ from README.md:${english.line}`,
		findings,
	};
}
