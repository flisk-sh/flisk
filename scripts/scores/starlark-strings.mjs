// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Starlark string literals that Tilt refuses to load. MEMORY.md, 2026-10-10 (#1023): Starlark has no implicit
// string-literal concatenation, and a shell regex inside a Starlark string needs each backslash doubled; a single `\(`
// fails with "invalid escape sequence". Both are valid Python, so they read fine in review and only break `flisk up`.
// The files are the ones starlark-loads reads (*.star and Tiltfiles under runtime/, the Tiltfile templates in
// cli/templates). Escapes are checked in every non-raw literal, docstrings included (Starlark parses those too): the
// valid ones are \a \b \f \n \r \t \v \\ \' \" \<newline>, octal \0-\7, \x, \u and \U. Two literals in a row are an
// error on one line, or across lines inside brackets, where a newline does not end the statement. A gate at zero.
import { read, walk } from "./lib.mjs";

export const meta = {
	id: "starlark-strings",
	title: "Starlark strings with an invalid escape or implicit concatenation",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "literals",
};

const isStarlark = (rel) => /\.star$/.test(rel) || /(^|\/)Tiltfile(\.hbs)?$/.test(rel);
const VALID_ESCAPE = /[abfnrtv\\'"\n0-7xuU]/;
const PREFIX = /^(?:[rRbB]|[rR][bB]|[bB][rR])$/;

// Problems in one Starlark file: { line, what }.
export function stringProblems(text) {
	const src = String(text);
	const out = [];
	let line = 1;
	let depth = 0;
	// Where the last string literal ended: { line, depth } while only whitespace or comments followed it.
	let lastString = null;
	let i = 0;
	while (i < src.length) {
		const ch = src[i];
		if (ch === "\n") {
			line++;
			i++;
			continue;
		}
		if (ch === " " || ch === "\t" || ch === "\r" || ch === "\\") {
			i++;
			continue;
		}
		if (ch === "#") {
			while (i < src.length && src[i] !== "\n") i++;
			continue;
		}
		// A string literal, with an optional r/b prefix directly before the quote.
		let start = i;
		let raw = false;
		const word = /^[A-Za-z]{1,2}(?=["'])/.exec(src.slice(i, i + 3));
		if (word && PREFIX.test(word[0]) && !/[\w]/.test(src[i - 1] ?? "")) {
			raw = /[rR]/.test(word[0]);
			i += word[0].length;
		}
		if (src[i] === '"' || src[i] === "'") {
			const startLine = line;
			if (lastString && (lastString.line === startLine || lastString.depth > 0)) {
				out.push({
					line: startLine,
					what: "two string literals in a row; Starlark has no implicit concatenation, join them with +",
				});
			}
			const quote = src.startsWith(src[i].repeat(3), i) ? src[i].repeat(3) : src[i];
			i += quote.length;
			while (i < src.length && !src.startsWith(quote, i)) {
				if (src[i] === "\n") {
					if (quote.length === 1) break;
					line++;
				}
				if (src[i] === "\\") {
					const next = src[i + 1] ?? "";
					if (!raw && !VALID_ESCAPE.test(next)) {
						out.push({ line, what: `invalid escape sequence \\${next} (write \\\\${next})` });
					}
					if (next === "\n") line++;
					i += 2;
					continue;
				}
				i++;
			}
			i += quote.length;
			lastString = { line, depth };
			continue;
		}
		i = start;
		if (ch === "(" || ch === "[" || ch === "{") depth++;
		else if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);
		lastString = null;
		i++;
	}
	return out;
}

// Handlebars tags blanked, newlines kept: `{{#if x}}` is not a Starlark comment and its braces are not brackets.
export const withoutHandlebars = (text) =>
	String(text).replace(/\{\{[\s\S]*?\}\}/g, (tag) => tag.replace(/[^\n]/g, " "));

export function measure({ root }) {
	const files = [...walk(root, "runtime", isStarlark), ...walk(root, "cli/templates", isStarlark)];
	const findings = files.flatMap((rel) => {
		const text = rel.endsWith(".hbs") ? withoutHandlebars(read(root, rel)) : read(root, rel);
		return stringProblems(text).map(({ line, what }) => `${rel}:${line} ${what}`);
	});
	return {
		value: findings.length,
		summary: `${files.length} Starlark files, ${findings.length} literals Starlark rejects`,
		findings,
	};
}
