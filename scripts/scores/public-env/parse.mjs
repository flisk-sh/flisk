// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Reads the assignments of public environment variables (NEXT_PUBLIC_*, VITE_*) from one line of text, in every
// spelling a user copies: `KEY=value`, `KEY: value`, `"KEY": "value"`, `ENV KEY=value`, `--build-arg KEY=value`,
// `- KEY=value`. Pure: a string in, { name, value } pairs out. No file, git or CLI access, so it is unit-tested alone.

// A public variable name that is not the tail of a longer identifier (`REACT_VITE_FRONTEND`, `_VITE_BUILD` are constants).
const NAME = /(?<![A-Za-z0-9_])(?:NEXT_PUBLIC|VITE)_[A-Z0-9_]+/g;
// What may sit between a name and its value: an optional closing quote, then `=` or `:`.
const SEPARATOR = /^["']?\s*[=:]\s*/;
const QUOTES = new Set(['"', "'", "`"]);
// An unquoted value ends at whitespace or a character that closes the surrounding syntax.
const UNQUOTED_END = /[\s"'`,;)}#]/;

// The value that starts `rest`: quoted up to its closing quote, or unquoted up to the first closing character.
export function readValue(rest) {
	const first = rest[0];
	if (QUOTES.has(first)) {
		const end = rest.indexOf(first, 1);
		return end === -1 ? rest.slice(1) : rest.slice(1, end);
	}
	const end = rest.search(UNQUOTED_END);
	return end === -1 ? rest : rest.slice(0, end);
}

// Each { name, value } the line assigns to a public variable, left to right.
export function assignments(line) {
	const out = [];
	for (const match of line.matchAll(NAME)) {
		const afterName = line.slice(match.index + match[0].length);
		const separator = SEPARATOR.exec(afterName);
		if (!separator) continue;
		out.push({ name: match[0], value: readValue(afterName.slice(separator[0].length)) });
	}
	return out;
}
