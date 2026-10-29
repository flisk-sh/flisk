// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The share of `flisk doctor` checks that docs/troubleshooting.md names. A doctor line is the first thing a stuck user
// sees; the page is where they look it up. A check nobody wrote down leaves them with a red line and no cause or fix.
// A check is every `name: "<Check name>"` in the CLI sources that build a CheckResult (the doctor commands and the
// utils they call); it counts as documented when its name appears in the page, in any case. Ratchet up: a new check
// lands with its troubleshooting entry, and the number only grows from the baseline.
import { has, read, round1, walk } from "./lib.mjs";

export const meta = {
	id: "doctor-check-docs",
	title: "Doctor checks documented in troubleshooting.md",
	source: "files",
	mode: "ratchet",
	better: "higher",
	unit: "%",
};

export const DOC = "docs/troubleshooting.md";
const SOURCES = /^cli\/src\/(commands\/doctor[\w-]*|utils\/(doctor[\w-]*|windows-doctor|service-config-checks|public-env-secrets))\.ts$/;

// The distinct check names in one source file: `name: "Docker Versions"` on a line that is a CheckResult literal.
export function checkNames(text) {
	const names = new Set();
	for (const m of text.matchAll(/^\s*(?:return \{ )?name: "([A-Z][^"]{2,60})",?\s*$/gm)) names.add(m[1]);
	return [...names];
}

export function measure({ root }) {
	if (!has(root, DOC)) throw new Error(`${DOC} is missing`);
	const names = [
		...new Set(walk(root, "cli/src", (rel) => SOURCES.test(rel) && !rel.includes("__tests__")).flatMap((rel) => checkNames(read(root, rel)))),
	].sort();
	if (!names.length) return { value: null };
	const doc = read(root, DOC).toLowerCase();
	const missing = names.filter((n) => !doc.includes(n.toLowerCase()));
	return {
		value: round1(((names.length - missing.length) / names.length) * 100),
		summary: `${names.length - missing.length}/${names.length} doctor checks named in ${DOC}`,
		findings: missing.map((n) => `${DOC}: no entry for the "${n}" check`),
	};
}
