// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Dependency folders and test output stay out of git. MEMORY.md: a committed cli/node_modules symlink (.gitignore
// does not match a symlink) stalls `bun install` and makes Lint, Test and Typecheck look cancelled; and the coverage/
// and test-results/ folders a coverage run leaves in cli/ make `biome check .` fail. Read from `git ls-files`, so a
// symlink counts like a folder: any tracked path with a node_modules, coverage or test-results segment, and
// .DS_Store files. A gate at zero.
import { trackedFiles } from "./tracked-secrets.mjs";

export const meta = {
	id: "tracked-build-output",
	title: "Tracked node_modules, coverage or test output",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "paths",
};

const OUTPUT = /(^|\/)(node_modules|coverage|test-results)(\/|$)|(^|\/)\.DS_Store$/;

// The first offending segment of a path, so a tracked folder is reported once rather than once per file.
export function outputRoot(rel) {
	const m = OUTPUT.exec(rel);
	if (!m) return null;
	return rel.slice(0, m.index + m[0].length).replace(/\/$/, "");
}

export function measure({ root }) {
	const files = trackedFiles(root);
	const roots = [...new Set(files.map(outputRoot).filter(Boolean))].sort();
	return {
		value: roots.length,
		summary: `${files.length} tracked paths, ${roots.length} dependency or test-output paths among them`,
		findings: roots.map((rel) => `${rel}: tracked build output; git rm -r --cached it and keep it ignored`),
	};
}
