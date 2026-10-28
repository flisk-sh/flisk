// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The committed CLI build uses LF line endings. MEMORY.md: on Windows, TypeScript keeps CRLF inside multiline template
// literals in the emitted cli/dist even with `--newLine lf`, and the repository has no .gitattributes to normalize it,
// so a build made on Windows commits CRLF into generated files and scripts the CLI writes for users. Read: every
// tracked text file under cli/dist and cli/dist-bundle. A gate at zero.
import { read } from "./lib.mjs";
import { trackedFiles } from "./tracked-secrets.mjs";

export const meta = {
	id: "dist-line-endings",
	title: "Committed cli/dist files with CRLF line endings",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "files",
};

const BUILD = /^cli\/dist(-bundle)?\//;
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|wasm|node)$/i;

// The 1-based line of the first CRLF in a text, or 0 when there is none.
export function firstCrlf(text) {
	const at = String(text).indexOf("\r\n");
	return at === -1 ? 0 : String(text).slice(0, at).split("\n").length;
}

export function measure({ root }) {
	const files = trackedFiles(root).filter((rel) => BUILD.test(rel) && !BINARY.test(rel));
	const findings = [];
	for (const rel of files) {
		const line = firstCrlf(read(root, rel));
		if (line) findings.push(`${rel}:${line} CRLF line ending; normalize the build to LF before staging`);
	}
	return {
		value: findings.length,
		summary: `${files.length} committed build files, ${findings.length} with CRLF`,
		findings,
	};
}
