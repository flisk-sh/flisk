// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The share of `flisk doctor` checks that docs/troubleshooting.md names. A doctor line is the first thing a stuck user
// sees and the page is where they look it up; a check nobody wrote down leaves a red line with no cause or fix. Name
// extraction is doctor-checks/extract.mjs. Ratchet up: a new check lands with its entry. See
// docs/scoreboard/doctor-check-docs.md.
import { collectCheckNames } from "./doctor-checks/extract.mjs";
import { has, read, round1 } from "./lib.mjs";

export const meta = {
	id: "doctor-check-docs",
	title: "Doctor checks documented in troubleshooting.md",
	source: "files",
	mode: "ratchet",
	better: "higher",
	unit: "%",
};

export const DOC = "docs/troubleshooting.md";

// The names the page does not mention, compared without regard to case.
export function undocumented(names, doc) {
	const haystack = doc.toLowerCase();
	return names.filter((name) => !haystack.includes(name.toLowerCase()));
}

export function measure({ root }) {
	if (!has(root, DOC)) throw new Error(`${DOC} is missing`);
	const names = collectCheckNames(root);
	if (!names.length) return { value: null };
	const missing = undocumented(names, read(root, DOC));
	return {
		value: round1(((names.length - missing.length) / names.length) * 100),
		summary: `${names.length - missing.length}/${names.length} doctor checks named in ${DOC}`,
		findings: missing.map((name) => `${DOC}: no entry for the "${name}" check`),
	};
}
