// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Every load() in the Starlark engine must point at a file that exists. Tilt resolves a relative load() against the
// directory of the file that calls it and stops `flisk up` with "cannot load" when the target is gone, so a rename or
// a move that misses one caller breaks the stack at runtime, not at review. The files: *.star and Tiltfiles under
// runtime/, and the Tiltfile templates in cli/templates. Loads inside docstrings and comments are prose, not code, and
// are not read; ext:// extensions and paths built at runtime ("{}".format(...), a variable) cannot be checked from the
// file and are left out. In cli/templates a load() names a file generated beside the Tiltfile, so <target>.hbs counts.
// A gate at zero.
import path from "node:path";
import { has, read, walk } from "./lib.mjs";

export const meta = {
	id: "starlark-loads",
	title: "Starlark load() targets that exist",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "missing",
};

const isStarlark = (rel) => /\.star$/.test(rel) || /(^|\/)Tiltfile(\.hbs)?$/.test(rel);

// The text with comments and triple-quoted strings (docstrings) blanked, newlines kept so line numbers still match.
// Single- and double-quoted strings stay: load() paths are written that way.
export function codeOnly(text) {
	let out = "";
	let i = 0;
	while (i < text.length) {
		const triple = text.startsWith('"""', i) ? '"""' : text.startsWith("'''", i) ? "'''" : null;
		if (triple) {
			const end = text.indexOf(triple, i + 3);
			const stop = end === -1 ? text.length : end + 3;
			out += text.slice(i, stop).replace(/[^\n]/g, " ");
			i = stop;
			continue;
		}
		const ch = text[i];
		if (ch === '"' || ch === "'") {
			let j = i + 1;
			while (j < text.length && text[j] !== ch && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
			out += text.slice(i, j + 1);
			i = j + 1;
			continue;
		}
		if (ch === "#") {
			const end = text.indexOf("\n", i);
			const stop = end === -1 ? text.length : end;
			out += " ".repeat(stop - i);
			i = stop;
			continue;
		}
		out += ch;
		i++;
	}
	return out;
}

// The literal first argument of every load() call, with its line. Spans lines: load(\n    "./x.star", ...).
export function loads(text) {
	const code = codeOnly(text);
	const out = [];
	for (const m of code.matchAll(/(?<![\w.])load\(\s*(["'])([^"'\n]*)\1/g)) {
		out.push({ target: m[2], line: code.slice(0, m.index).split("\n").length });
	}
	return out;
}

// A target this scorer can check: a plain relative or repo path, not an extension or a runtime-built string.
export const checkable = (target) => !/^ext:\/\//.test(target) && !/[{}$%<>]/.test(target) && target.length > 0;

export function measure({ root }) {
	const files = [...walk(root, "runtime", isStarlark), ...walk(root, "cli/templates", isStarlark)];
	const findings = [];
	let checked = 0;
	for (const rel of files) {
		for (const { target, line } of loads(read(root, rel))) {
			if (!checkable(target)) continue;
			checked++;
			const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(rel), target));
			// A template's load() names a file generated next to it from <name>.hbs (TILT_TECH_STACK.star.hbs).
			const generated = rel.startsWith("cli/templates/") && has(root, `${resolved}.hbs`);
			if (!has(root, resolved) && !generated) findings.push(`${rel}:${line} load("${target}"): no file at ${resolved}`);
		}
	}
	return {
		value: findings.length,
		summary: `${checked} load() calls in ${files.length} Starlark files, ${findings.length} pointing at a missing file`,
		findings,
	};
}
